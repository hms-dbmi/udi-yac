// A side legend taller than its chart (legendFit.ts): a content-sized chart
// grows to show all of it, a fixed-height one cuts it to the rows that fit.
// Imports the .ts source directly (Node strips types), so no dist build is needed.
//
// Run with: node test/legend-fit.mjs
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import {
  fitLegend,
  patchLegendLimit,
  LEGEND_LIMIT_SIGNAL,
} from '../legendFit.ts';

// One stacked bar with twelve colours: a 20px plot under an ~170px legend.
const values = 'abcdefghijkl'.split('').map((c) => ({ c, n: 1 }));
async function view(sizing) {
  const vl = {
    width: 400,
    data: { values },
    mark: 'bar',
    encoding: {
      x: { field: 'n', type: 'quantitative' },
      color: { field: 'c', type: 'nominal' },
    },
    ...sizing,
  };
  const v = new vega.View(vega.parse(patchLegendLimit(compile(vl).spec)), {
    renderer: 'none',
  });
  await v.runAsync();
  return v;
}
const labels = async (v) =>
  [...(await v.toSVG()).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(
    (m) => m[1],
  );

// Content-sized (fit-x, as UDIVis without fillContainer): the bottom padding
// grows by the overflow, once; a second fit changes nothing.
{
  const v = await view({ autosize: { type: 'fit-x', contains: 'padding' } });
  const before = v.padding().bottom;
  await fitLegend(v, true);
  const grown = v.padding().bottom;
  assert.ok(grown > before + 100, `padding grew only to ${grown}`);
  await fitLegend(v, true);
  assert.equal(v.padding().bottom, grown);
}

// Fixed height (fit, as UDIVis with fillContainer): entries are cut, the last
// row naming how many are hidden, and every entry kept stays inside.
{
  const v = await view({
    height: 120,
    autosize: { type: 'fit', contains: 'padding' },
  });
  await fitLegend(v, false);
  const limit = v.signal(LEGEND_LIMIT_SIGNAL);
  assert.ok(limit < 12, `limit stayed at ${limit}`);
  const text = await labels(v);
  assert.ok(text.includes(`…${12 - limit + 1} entries`), text.join(','));
  const marks = v.scenegraph().root.items[0].items;
  const legend = marks.find((m) => m.role === 'legend');
  const chartBottom = Math.max(
    v.height(),
    ...marks.filter((m) => m !== legend).map((m) => m.bounds.y2),
  );
  assert.ok(
    legend.bounds.y2 <= chartBottom,
    `legend ends ${legend.bounds.y2 - chartBottom}px low`,
  );
}

console.log('legend-fit: ok');
