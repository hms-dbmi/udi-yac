/**
 * `toVegaConfig` — the vega-embed `config` a palette turns into.
 *
 * Run with: node test/palette-config.mjs   (after pnpm build:toolkit)
 *
 * The scale channels fall back to DEFAULT_PALETTE so an empty palette renders
 * exactly as before. The surface keys (background, text, axis, grid) must do
 * the opposite: when unset they are absent from the config, so Vega's own
 * defaults apply and no existing chart changes; when set they reach every
 * non-mark text and line, which is what lets a host theme the plot for dark
 * mode (the data marks already followed the palette, the surface did not).
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import { toVegaConfig, DEFAULT_PALETTE } from '../dist/index.js';

const registerScheme = () => 'registered-scheme';

// 1. No palette: scale defaults only, nothing about the surface.
const base = toVegaConfig(undefined, registerScheme);
assert.deepEqual(base.mark, { color: DEFAULT_PALETTE.mark });
assert.deepEqual(base.range, {
  category: DEFAULT_PALETTE.category,
  ordinal: { scheme: DEFAULT_PALETTE.ordinal },
  ramp: { scheme: DEFAULT_PALETTE.ramp },
});
for (const key of ['background', 'axis', 'legend', 'header', 'title']) {
  assert.equal(
    key in base,
    false,
    `${key} must be absent when the palette does not set it`,
  );
}
assert.deepEqual(
  toVegaConfig({}, registerScheme),
  base,
  'an empty palette equals no palette',
);

// 2. A surface palette themes every non-mark text and line.
const dark = toVegaConfig(
  { background: '#0b1220', text: '#e5e7eb', axis: '#6b7280', grid: '#1f2937' },
  registerScheme,
);
assert.equal(dark.background, '#0b1220');
assert.deepEqual(dark.axis, {
  labelColor: '#e5e7eb',
  titleColor: '#e5e7eb',
  domainColor: '#6b7280',
  tickColor: '#6b7280',
  gridColor: '#1f2937',
});
assert.deepEqual(dark.legend, { labelColor: '#e5e7eb', titleColor: '#e5e7eb' });
assert.deepEqual(dark.header, { labelColor: '#e5e7eb', titleColor: '#e5e7eb' });
assert.deepEqual(dark.title, { color: '#e5e7eb', subtitleColor: '#e5e7eb' });
// The scale defaults are untouched by surface keys.
assert.deepEqual(dark.range, base.range);
assert.deepEqual(dark.mark, base.mark);

// 3. Surface keys are independent: only what is set appears.
const gridOnly = toVegaConfig(
  { grid: 'rgba(255,255,255,0.1)' },
  registerScheme,
);
assert.deepEqual(gridOnly.axis, { gridColor: 'rgba(255,255,255,0.1)' });
assert.equal('legend' in gridOnly, false);
assert.equal('background' in gridOnly, false);

const transparent = toVegaConfig({ background: 'transparent' }, registerScheme);
assert.equal(transparent.background, 'transparent');
assert.equal('axis' in transparent, false);

// 4. Scale channels still resolve as before alongside surface keys.
const mixed = toVegaConfig(
  { mark: '#123456', ramp: (t) => `rgb(${t},0,0)`, text: '#fff' },
  registerScheme,
);
assert.deepEqual(mixed.mark, { color: '#123456' });
assert.deepEqual(mixed.range.ramp, { scheme: 'registered-scheme' });
assert.equal(mixed.axis.labelColor, '#fff');

// 5. End to end: the config reaches the rendered SVG the way vega-embed would
//    apply it. This is the symptom from the field — data marks followed the
//    palette while axis text stayed rgb(0,0,0) on a white rectangle.
async function renderSVG(config) {
  const { spec } = compile(
    {
      data: { values: [{ a: 'x', b: 1 }] },
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
    },
    { config },
  );
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });
  return view.toSVG();
}

const axisLabelFills = (svg) =>
  new Set(
    [...svg.matchAll(/<g class="mark-text role-axis-label"[\s\S]*?<\/g>/g)]
      .flatMap((m) => [...m[0].matchAll(/fill="([^"]+)"/g)])
      .map((m) => m[1]),
  );

const before = await renderSVG(base);
assert.deepEqual(
  [...axisLabelFills(before)],
  ['#000'],
  'default axis labels are black',
);
// Vega draws the surface as the first element: `<rect width height fill>`.
const surfaceFill = (svg) =>
  svg.match(/^<svg[^>]*><rect [^>]*fill="([^"]+)"/)?.[1];
assert.equal(surfaceFill(before), 'white', 'default surface is a white rect');

const after = await renderSVG(dark);
assert.deepEqual(
  [...axisLabelFills(after)],
  ['#e5e7eb'],
  'themed axis labels use `text`',
);
assert.equal(surfaceFill(after), '#0b1220', 'themed surface uses `background`');
assert.match(
  after,
  /role-axis-domain[\s\S]*?stroke="#6b7280"/,
  'axis domain line uses `axis`',
);
assert.match(
  after,
  /role-axis-grid[\s\S]*?stroke="#1f2937"/,
  'grid lines use `grid`',
);

console.log('palette-config: ok');
