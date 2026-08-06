/**
 * Why an outlined text layer is drawn twice, and what a title `align` compiles to.
 *
 * Run with: node test/text-outline.mjs   (after pnpm build:toolkit)
 *
 * A `stroke` on a text mark is meant as a legibility halo, but SVG paints stroke
 * *over* fill and vega emits no `paint-order`, so one pass hollows out the glyphs
 * instead of ringing them. UDIVis compensates by emitting the layer twice — halo
 * pass, then the same text unstroked on top. If vega ever starts emitting
 * paint-order, the first assertion here fails and that workaround can go.
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';

const textLayer = (mark) => ({
  mark: { type: 'text', ...mark },
  encoding: {
    x: { field: 'a', type: 'quantitative' },
    y: { field: 'b', type: 'quantitative' },
    text: { field: 't' },
  },
});

const HALO = { stroke: 'white', strokeWidth: 3, strokeOpacity: 0.7 };

async function renderSVG(vlSpec) {
  const { spec } = compile(vlSpec);
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });
  return view.toSVG();
}

// 1. A single stroked pass carries the stroke but no paint-order, i.e. the stroke
//    lands on top of the fill — the reason a second pass is needed.
const single = await renderSVG({
  data: { values: [{ a: 1, b: 2, t: 'Seattle 63%' }] },
  layer: [textLayer(HALO)],
});
const stroked = (single.match(/<text[^>]*>/g) ?? []).filter((t) =>
  t.includes('stroke='),
);
assert.equal(stroked.length, 1, 'the stroked text mark should render');
assert.ok(
  !/paint-order/.test(single),
  'vega emits no paint-order; the double pass is required',
);

// 2. What UDIVis emits for one grammar layer with an outline: the halo, then the
//    same encoding with the stroke properties dropped.
const doubled = await renderSVG({
  data: { values: [{ a: 1, b: 2, t: 'Seattle 63%' }] },
  layer: [textLayer(HALO), textLayer({})],
});
const texts = (doubled.match(/<text[^>]*>/g) ?? []).filter((t) =>
  t.includes('Seattle'),
);
assert.equal(texts.length, 2, 'both passes should draw the label');
assert.ok(
  texts[0].includes('stroke="white"'),
  'the halo is drawn first, underneath',
);
assert.ok(
  !texts[1].includes('stroke='),
  'the pass on top is fill only, so glyphs stay crisp',
);

// 3. Title placement. UDIVis maps left/center/right onto vega's anchor keywords;
//    this pins that those keywords reach the rendered title.
for (const [anchor, expected] of [
  ['start', 'start'],
  ['end', 'end'],
]) {
  const { spec } = compile({
    data: { values: [{ a: 1, b: 2 }] },
    title: { text: 'organization_name', anchor },
    mark: 'point',
    encoding: {
      x: { field: 'a', type: 'quantitative' },
      y: { field: 'b', type: 'quantitative' },
    },
  });
  assert.equal(
    spec.title.anchor ?? 'middle',
    expected,
    `title anchor ${anchor} should survive`,
  );
}

console.log('text-outline: all assertions passed');
