---
name: run-udi-toolkit
description: Run, start, drive and screenshot udi-toolkit (UDIVis) charts in Storybook with headless Chromium — brush or click a chart, dump its Vega scale domains and data rows, compare before/after a change. Use when asked to run the toolkit, check a UDIVis/VegaLite rendering or cross-filter change in a real browser, take a screenshot of a chart, or run the toolkit tests.
---

Start the toolkit's Storybook, then drive one story at a time with
`.claude/skills/run-udi-toolkit/driver.mjs`. It loads the story in headless
Chromium, prints every chart's Vega `x`/`y`/`color` scale domains and data rows,
can brush or click one chart, then prints them again and screenshots both states.

All paths below are relative to `packages/grammar/`.

## Prerequisites

- A Chromium binary. The driver defaults to `/usr/bin/chromium`; point
  `CHROMIUM` at another binary if yours lives elsewhere. This was verified on
  Arch Linux with the system Chromium 153, headless, no xvfb.
- Node ≥ 18 for `node:util` `parseArgs` and global `fetch` (verified on Node 24).
- `playwright-core` is **not** a repo dependency. Install it outside the repo,
  once:

```bash
npm i --prefix "${PW_DIR:-/tmp/udi-pw}" playwright-core@1.52 --no-audit --no-fund
```

The driver resolves it from `$PW_DIR` (default `/tmp/udi-pw`), so export the same
`PW_DIR` if you changed it.

## Setup

Repo onboarding (`pnpm setup` at the repo root) is enough. Storybook serves the
toolkit **source**, so it needs no toolkit build. Sample data comes from repo-root
`sample-data/`, mounted at `/data`.

## Run (agent path)

Start Storybook in the background and wait until it serves the story index:

```bash
(pnpm storybook --ci > /tmp/udi-storybook.log 2>&1 &)
timeout 120 bash -c 'until curl -sf http://localhost:6006/index.json >/dev/null; do sleep 1; done'
```

List story ids. They follow `<title-kebab>--<export-kebab>`, e.g.
`interactions--default`.

```bash
node .claude/skills/run-udi-toolkit/driver.mjs
```

Brush a scatter plot that cross-filters a `groupby → rollup` bar chart:

```bash
node .claude/skills/run-udi-toolkit/driver.mjs interactions--default --brush 76,85,205,234
```

Click a bar. The point selection filters the scatter plot below it:

```bash
node .claude/skills/run-udi-toolkit/driver.mjs interactions--point-selection-cross-filter --click 200,200
```

Hover or click a category-axis label. On a bar chart whose point selection covers
the axis field, labels are clickable (`axisLabelSelect.ts`). A hover prints the
visible Vega tooltip, here the tiny "Unknown" bar's total:

```bash
node .claude/skills/run-udi-toolkit/driver.mjs interactions--point-selection-cross-filter --hover 777,333
```

`--shift` holds Shift through a `--click`. That starts a pick gesture: the
`2-after` shot shows the dimming, and the driver then releases Shift, dumps again
and saves `3-committed`.

```bash
node .claude/skills/run-udi-toolkit/driver.mjs interactions--point-selection-cross-filter --click 777,333 --shift
```

Output looks like this:

```
--- brushed
chart 1: n=2
  x: ["Female","Male","Unknown"]
  y: [0,1]
  row {"sex":"Male","sex_count":1}
screenshot /tmp/udi-toolkit-run/interactions--default-2-after.png
console errors: ["Failed to load resource: ... 404 (Not Found)"]
```

Screenshots go to `/tmp/udi-toolkit-run/<story>-1-initial.png` and
`<story>-2-after.png` (change with `--out`). **Open the screenshot.** The domain
dump shows what Vega was told; the picture shows what it drew.

| flag                  | what it does                                             |
| --------------------- | -------------------------------------------------------- |
| `--brush x0,y0,x1,y1` | drag an interval brush on chart `--chart` (default 0)    |
| `--click x,y`         | click chart `--chart` (point selection)                  |
| `--shift`             | hold Shift through `--click`, then release and re-dump   |
| `--hover x,y`         | move onto a point and print the Vega tooltip, if shown   |
| `--chart N`           | which `.vega-embed` on the page, in DOM order            |
| `--out DIR`           | screenshot directory (default `/tmp/udi-toolkit-run`)    |
| `--rows N`            | data rows to print per chart (default 4)                 |
| `--settle MS`         | wait after load and after the interaction (default 2500) |
| `--url URL`           | Storybook base (default `http://localhost:6006`)         |

Coordinates are pixels relative to the chart's `.vega-embed` box, in the driver's
1000×1100 viewport. The box itself sits at about (16,17) on the page, so don't
reuse page coordinates. On the `interactions--default` scatter plot, the plot area
spans roughly x 60→940 (weight 0→166) and y 323→25 (height 0→203). Axis labels
are only about 11px wide when rotated, so read their centers off the DOM, relative
to the same box, before hovering or clicking one:

```js
const embed = document.querySelector('.vega-embed').getBoundingClientRect();
[...document.querySelectorAll('.udi-clickable-labels text')].map((t) => {
  const r = t.getBoundingClientRect();
  return `${t.textContent}: ${Math.round(r.x + r.width / 2 - embed.x)},${Math.round(r.y + r.height / 2 - embed.y)}`;
});
```

### A spec no story has

Write a throwaway `ZZScratch.stories.ts` at the package root. Storybook's glob is
`../*.stories.@(js|jsx|mjs|ts|tsx)`, and HMR picks the new file up within
seconds as story `zzscratch--<export>`. Delete it when you are done.

```ts
import TestMultipleSpecs from './TestMultipleSpecs.vue';
export default { component: TestMultipleSpecs, title: 'ZZScratch' };
export const Check = {
  args: { specs: [/* UDI specs; a named filter links them */] },
};
```

`TestMultipleSpecs` renders several specs sharing one Pinia store, so a `select`
in one and `{ filter: { name } }` in another cross-filter each other.

### Before/after a change

Vite hot-reloads the source, so you can run the old code against the same story.
Reverse the change as a patch against `BASE`, which is whatever "before" means:
`HEAD` for uncommitted work, `HEAD~1` or `main` once it's committed. Run the
driver, then reapply the patch. `test -s` stops the whole thing if the diff is
empty.

```bash
git diff "${BASE:-HEAD}" -- UDIVis.vue > /tmp/udi-change.patch && test -s /tmp/udi-change.patch && git apply -R /tmp/udi-change.patch && sleep 4
node .claude/skills/run-udi-toolkit/driver.mjs interactions--default --brush 76,85,205,234 --out /tmp/before
git apply /tmp/udi-change.patch && git diff --stat "${BASE:-HEAD}" -- UDIVis.vue
```

Don't use `git stash push <file>` for this. When the file has no changes, the
push saves nothing, and the `git stash pop` after it applies and drops whatever
stash was already there, which may be someone else's work.

Stop Storybook:

```bash
lsof -ti:6006 -sTCP:LISTEN | xargs -r kill
```

## Run (human path)

`pnpm --filter udi-toolkit storybook --ci` from the repo root, then open
http://localhost:6006. Ctrl-C stops it.

## Test

The tests need a built `dist/` (the smoke tests import it):

```bash
pnpm --filter udi-toolkit test
```

It runs `build:all`, then each `test/*.mjs`. Pure helpers can run on their own,
with no build: those tests import the `.ts` source and Node strips the types.

```bash
node test/category-order.mjs
```

## Gotchas

- **Charts render SVG, not canvas.** Waiting for `canvas` times out. The driver
  waits for `.vega-embed svg`.
- **The Vega view is not on the DOM.** The driver reaches it through Vue:
  `#storybook-root.__vue_app__._instance.subTree`, walked down to each
  `VegaLite.vue` instance's `setupState.vegaView`. Then `view.scale('x').domain()`
  and `view.data('udi_data')` work as usual.
- **A stacked bar's `y` domain can read `[0,0]` after a brush** while the bars
  plainly draw (seen with `groupby: [race, sex]`). Trust `n=` and the rows, and
  the screenshot, over the `y` domain.
- **A brush over an empty region gives an empty bar chart, not an error.** The
  store holds a valid selection; it simply matched no rows. If bars vanish, move
  the brush onto visible points before suspecting the code.
- **A chart filtered by its own selection shrinks to what you picked.** In
  `interactions--point-selection-cross-filter`, clicking Female leaves the bar
  chart with `n=1` while its `x` domain keeps all three categories.
- **`page.screenshot()` hangs whenever the pointer rests on SVG text**, with or
  without any CSS, until `Timeout 30000ms exceeded`, right after its log says
  fonts loaded. `page.hover()` leaves the pointer there too. The driver captures
  over CDP (`Page.captureScreenshot`) instead, and moves with `page.mouse`.
- **`captureBeyondViewport` drops `position: fixed` overlays**, the Vega tooltip
  among them. The driver only uses it for pages taller than the viewport, so on a
  tall page a tooltip shows in the printed `tooltip:` line but not in the shot.
- **Chrome won't underline SVG text in an animatable way.** It ignores
  `text-underline-offset` (computes `auto`) and paints the decoration in the
  text's fill, ignoring `text-decoration-color`. That's why hovered labels get an
  HTML overlay line instead (VegaLite.vue, `.udi-label-underline`).
- **Every story load logs one `404 (Not Found)` console error.** Charts render
  fine; ignore it and look for anything else in `console errors`.
- **No `chromium-cli` and no Playwright in the repo.** That is why the driver
  loads `playwright-core` through `createRequire` from `$PW_DIR` instead of a bare
  import.

## Troubleshooting

- **`page.waitForSelector: Timeout 60000ms exceeded … waiting for locator('canvas')`**:
  you waited for a canvas. UDIVis draws SVG, so wait for `.vega-embed svg`.
- **`Cannot find module 'playwright-core'`**: `PW_DIR` doesn't point at the
  `npm i --prefix` directory. Export the same `PW_DIR` you installed into.
