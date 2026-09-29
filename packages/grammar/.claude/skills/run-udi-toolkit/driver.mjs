#!/usr/bin/env node
// Drive one udi-toolkit Storybook story in headless Chromium.
//
// Loads the story's iframe, dumps every rendered chart's Vega scale domains
// (x / y / color) and data rows, optionally brushes or clicks one chart, dumps
// again, and screenshots both states. See SKILL.md next to this file.
//
//   node driver.mjs                          list story ids
//   node driver.mjs <story-id>               load + dump + screenshot
//   node driver.mjs <story-id> --brush 76,85,420,234 [--chart 0]
//   node driver.mjs <story-id> --click 300,200 [--chart 0]
//
// Brush/click coordinates are pixels relative to the chart's `.vega-embed`
// box. playwright-core is not a repo dependency: it is resolved from $PW_DIR
// (default /tmp/udi-pw), and the browser is $CHROMIUM (default
// /usr/bin/chromium).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:6006' },
    brush: { type: 'string' },
    click: { type: 'string' },
    chart: { type: 'string', default: '0' },
    out: { type: 'string', default: '/tmp/udi-toolkit-run' },
    settle: { type: 'string', default: '2500' },
    rows: { type: 'string', default: '4' },
  },
});
const [story] = positionals;

if (!story) {
  const index = await (await fetch(`${opt.url}/index.json`)).json();
  for (const [id, entry] of Object.entries(index.entries)) {
    if (entry.type === 'story') console.log(id);
  }
  process.exit(0);
}

const pwDir = process.env.PW_DIR ?? '/tmp/udi-pw';
const { chromium } = createRequire(`${pwDir}/noop.js`)('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await (
  await browser.newContext({ viewport: { width: 1000, height: 1100 } })
).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const settle = Number(opt.settle);
mkdirSync(opt.out, { recursive: true });

await page.goto(`${opt.url}/iframe.html?id=${story}&viewMode=story`, {
  waitUntil: 'networkidle',
});
// Charts render to SVG — there is no <canvas> to wait for.
await page.waitForSelector('.vega-embed svg', { timeout: 60000 });
await page.waitForTimeout(settle);

// Every VegaLite.vue instance keeps its Vega view in setupState.vegaView;
// walk the Vue vnode tree from the Storybook root to collect them in order.
const dump = (label) =>
  page
    .evaluate((maxRows) => {
      const views = [];
      const walk = (v) => {
        if (!v || typeof v !== 'object') return;
        if (v.component) {
          const s = v.component.setupState;
          if (s && 'vegaView' in s && s.vegaView) views.push(s.vegaView);
          walk(v.component.subTree);
        }
        if (Array.isArray(v.children)) v.children.forEach(walk);
      };
      walk(
        document.querySelector('#storybook-root').__vue_app__._instance.subTree,
      );
      return views.map((view) => {
        const out = {};
        for (const s of ['x', 'y', 'color']) {
          try {
            out[s] = view.scale(s).domain();
          } catch {
            // chart has no such scale
          }
        }
        const rows = view.data('udi_data');
        out.n = rows.length;
        out.rows = rows
          .slice(0, maxRows)
          .map((r) => JSON.stringify(r).slice(0, 160));
        return out;
      });
    }, Number(opt.rows))
    .then((charts) => {
      console.log(`--- ${label}`);
      charts.forEach((c, i) => {
        console.log(`chart ${i}: n=${c.n}`);
        for (const s of ['x', 'y', 'color']) {
          if (c[s]) console.log(`  ${s}: ${JSON.stringify(c[s])}`);
        }
        c.rows.forEach((r) => console.log(`  row ${r}`));
      });
    });

const shot = async (suffix) => {
  const path = `${opt.out}/${story}-${suffix}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot ${path}`);
};

await dump('initial');
await shot('1-initial');

if (opt.brush || opt.click) {
  const embeds = await page.$$('.vega-embed');
  const box = await embeds[Number(opt.chart)].boundingBox();
  if (opt.brush) {
    const [x0, y0, x1, y1] = opt.brush.split(',').map(Number);
    await page.mouse.move(box.x + x0, box.y + y0);
    await page.mouse.down();
    // Drag in steps, the way a real pointer moves.
    await page.mouse.move(box.x + x1, box.y + y1, { steps: 10 });
    await page.mouse.up();
  } else {
    const [x, y] = opt.click.split(',').map(Number);
    await page.mouse.click(box.x + x, box.y + y);
  }
  await page.waitForTimeout(settle);
  await dump(opt.brush ? 'brushed' : 'clicked');
  await shot('2-after');
}

console.log('console errors:', JSON.stringify(errors));
await browser.close();
