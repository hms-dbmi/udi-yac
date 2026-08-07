/**
 * `interpolate` on a line layer reaches vega-lite as a step.
 *
 * Run with: node test/step-interpolate.mjs   (after pnpm build:toolkit)
 *
 * A survival curve is a step function: the fraction alive holds between deaths and
 * drops at each one. Drawn with the default straight segment it shows a gradual
 * decline nobody observed, and invites a reader to take a value off the axis at a
 * time when nothing was measured. This pins that the layer property survives
 * compilation and that the rendered path really is orthogonal.
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';

const rows = [
  { t: 0, p: 100 },
  { t: 1, p: 80 },
  { t: 3, p: 40 },
];

const chart = (mark) => ({
  data: { values: rows },
  layer: [
    {
      mark: { type: 'line', ...mark },
      encoding: {
        x: { field: 't', type: 'quantitative' },
        y: { field: 'p', type: 'quantitative' },
      },
    },
  ],
});

async function pathFor(mark) {
  const { spec } = compile(chart(mark));
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });
  const svg = await view.toSVG();
  const d = svg.match(/<path[^>]*aria-label[^>]*d="([^"]+)"/)?.[1];
  return d ?? svg.match(/<path class="background"[\s\S]*?<path[^>]*d="([^"]+)"/)?.[1];
}

const stepped = await pathFor({ interpolate: 'step-after' });
const sloped = await pathFor({});
assert.ok(stepped && sloped, 'both variants should render a path');
assert.notEqual(stepped, sloped, 'step-after must change the drawn path');

// A step path is built from orthogonal runs: every segment shares an x or a y with
// the point before it. That is the property a reader relies on — no diagonal means
// no implied value between observations.
const points = [...stepped.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
  Number(m[1]),
  Number(m[2]),
]);
assert.ok(points.length > rows.length, 'stepping should add the corner points');
for (let i = 1; i < points.length; i++) {
  const [x1, y1] = points[i - 1];
  const [x2, y2] = points[i];
  assert.ok(
    Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6,
    `segment ${i} is diagonal: (${x1},${y1})->(${x2},${y2})`,
  );
}

// The sloped default, by contrast, goes straight from point to point.
assert.equal(
  [...sloped.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].length,
  rows.length,
  'a linear line should have exactly one point per row',
);

console.log('step-interpolate: all assertions passed');
