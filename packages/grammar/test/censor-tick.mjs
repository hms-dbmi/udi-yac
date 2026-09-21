/**
 * The censoring tick has to ENCLOSE AN AREA, or it renders as nothing.
 *
 * Run with: node test/censor-tick.mjs   (no dist build needed)
 *
 * Point marks are painted filled here, with `stroke: none`. Filling a path of
 * zero width paints nothing at all — so a tick given as the obvious
 * `M0,-0.5L0,0.5` vertical line sits in the DOM at exactly the right place, at
 * exactly the right size, with the right fill colour, and is invisible. It was
 * shipped that way once: the survival curves looked unchanged, and the ticks were
 * only found missing by eye, because counting the marks and measuring their
 * geometry both said they were there.
 *
 * So this reads the shape the templates actually use out of the generated
 * template JSON and asserts vega paints something for it, rather than trusting
 * the path to look plausible.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'vega-lite';
import * as vega from 'vega';

const here = dirname(fileURLToPath(import.meta.url));
const templatesPath = resolve(
  here,
  '../../agent/src/udiagent/data/skills/template_visualizations.json',
);
const templates = JSON.parse(readFileSync(templatesPath, 'utf8'));

// Every survival template carries the same tick layer: a point mark whose shape
// is a literal SVG path and whose x is the censoring time.
const shapes = new Set();
for (const t of templates) {
  const spec = JSON.parse(t.spec_template);
  const layers = Array.isArray(spec.representation)
    ? spec.representation
    : [spec.representation].filter(Boolean);
  for (const layer of layers) {
    if (layer?.mark !== 'point') continue;
    const mapping = Array.isArray(layer.mapping)
      ? layer.mapping
      : [layer.mapping];
    const x = mapping.find((m) => m?.encoding === 'x');
    const shape = mapping.find((m) => m?.encoding === 'shape');
    if (x?.field === 'censor year' && typeof shape?.value === 'string') {
      shapes.add(shape.value);
    }
  }
}
assert.ok(
  shapes.size > 0,
  'no censoring tick layer found in the generated templates',
);
assert.equal(shapes.size, 1, `tick shape should be shared, got ${[...shapes]}`);
const [TICK] = [...shapes];

/** Width and height of what vega actually draws for a symbol path. */
async function painted(shape) {
  const spec = compile({
    data: { values: [{ x: 5, y: 50 }] },
    width: 200,
    height: 200,
    // How the toolkit paints point marks: filled, no stroke. A stroked mark
    // would show a zero-area path; a filled one cannot.
    mark: { type: 'point', filled: true },
    encoding: {
      x: { field: 'x', type: 'quantitative', scale: { domain: [0, 10] } },
      y: { field: 'y', type: 'quantitative', scale: { domain: [0, 100] } },
      shape: { value: shape },
      size: { value: 500 },
    },
  }).spec;
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });
  await view.runAsync();
  const svg = await view.toSVG();
  const d = [...svg.matchAll(/<path[^>]* d="(M[^"]+)"/g)]
    .map((m) => m[1])
    .find((p) => /^M-?[\d.]+,-?[\d.]+L/.test(p));
  assert.ok(d, `vega drew no symbol path for shape ${shape}`);
  const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
    +m[1],
    +m[2],
  ]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

const tick = await painted(TICK);

// Enclosing an area is the whole point: fill needs something to fill.
assert.ok(
  tick.width * tick.height > 1,
  `the tick paints nothing when filled (${tick.width}x${tick.height}) — ` +
    'give the shape width, not a bare line',
);
// And it has to read as a tick: clearly taller than wide, and big enough to see
// against the curve it sits on without dominating a curve carrying dozens.
assert.ok(
  tick.height > tick.width * 2,
  `a censoring tick must be vertical, got ${tick.width}x${tick.height}`,
);
assert.ok(
  tick.height >= 6 && tick.height <= 20,
  `tick height ${tick.height}px is outside the legible range`,
);
assert.ok(tick.width >= 1, `tick width ${tick.width}px is too thin to see`);

// The failure mode, pinned in the other direction: the obvious bare line really
// does paint nothing, so nobody "simplifies" the shape back to it.
const line = await painted('M0,-0.5L0,0.5');
assert.equal(
  line.width,
  0,
  'a bare vertical line should have zero width — if vega changed this, the ' +
    'area requirement above may no longer be necessary',
);

console.log(
  `censor-tick: all assertions passed (${tick.width.toFixed(1)}x${tick.height.toFixed(1)}px)`,
);
