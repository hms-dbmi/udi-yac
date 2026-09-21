/**
 * A data changeset can only swap rows. Everything else needs a fresh compile.
 *
 * Run with: node test/spec-shape-reembed.mjs   (after pnpm build:toolkit)
 *
 * Reported from YAC as survival curves rendering wrongly after a filter, and
 * correcting themselves when the card was toggled to table view and back —
 * toggling unmounts the Vega view, so it re-embeds by accident. That is the
 * signature of a view still compiled from an older spec.
 *
 * `VegaLite.updateVegaChart` used to apply every spec change as a `changeset` on
 * the named dataset. That is right for a brush, where only the rows differ, and
 * wrong for anything else: scale domains, encodings, mark config and the layer
 * list are all baked in at compile time. A filter that changes the data extent
 * changes the domain the spec asks for, and the running view keeps the old one —
 * so new rows get drawn through stale scales.
 *
 * This pins the vega behaviour the fix rests on. If a future vega makes explicit
 * domains reactive to data, the first assertion fails and the re-embed can be
 * reconsidered.
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';

const spec = (domain) =>
  compile({
    data: { name: 'udi_data' },
    layer: [
      {
        mark: { type: 'line' },
        encoding: {
          x: { field: 'x', type: 'quantitative', scale: { domain } },
          y: { field: 'y', type: 'quantitative', scale: { domain: [0, 100] } },
        },
      },
    ],
  }).spec;

const embed = async (domain, rows) => {
  const view = new vega.View(vega.parse(spec(domain)), { renderer: 'none' });
  view.change('udi_data', vega.changeset().insert(rows));
  await view.runAsync();
  return view;
};

// 1. A changeset does not move a compiled domain — not even after resize(),
//    which recomputes layout but not the spec.
const view = await embed(
  [0, 2704],
  [
    { x: 0, y: 100 },
    { x: 2704, y: 40 },
  ],
);
assert.deepEqual(view.scale('x').domain(), [0, 2704]);

view.change(
  'udi_data',
  vega.changeset()
    .remove(() => true)
    .insert([
      { x: 0, y: 100 },
      { x: 500, y: 40 },
    ]),
);
await view.resize().runAsync();
assert.deepEqual(
  view.scale('x').domain(),
  [0, 2704],
  'a changeset must not be expected to update an explicit domain',
);

// 2. Which is why the same rows compiled from the narrower spec place marks
//    differently: the stale view is not merely imprecise, it is wrong.
const fresh = await embed(
  [0, 500],
  [
    { x: 0, y: 100 },
    { x: 500, y: 40 },
  ],
);
assert.deepEqual(fresh.scale('x').domain(), [0, 500]);
assert.notEqual(
  view.scale('x')(500),
  fresh.scale('x')(500),
  'the stale and recompiled views should disagree about where x=500 sits',
);

// 3. The shape comparison the fix uses: identical but for the rows means the
//    changeset path is safe; any other difference means it is not.
const shape = (s) => {
  const { data, ...rest } = s;
  const withoutRows = { ...(data ?? {}) };
  delete withoutRows.values;
  return JSON.stringify({ ...rest, data: withoutRows });
};
const withRows = (domain, rows) => ({
  ...spec(domain),
  data: { name: 'udi_data', values: rows },
});
assert.equal(
  shape(withRows([0, 100], [{ x: 1 }])),
  shape(withRows([0, 100], [{ x: 2 }, { x: 3 }])),
  'differing only in rows must compare equal — the brush fast path',
);
assert.notEqual(
  shape(withRows([0, 100], [{ x: 1 }])),
  shape(withRows([0, 50], [{ x: 1 }])),
  'a changed domain must compare unequal, forcing a re-embed',
);

console.log('spec-shape-reembed: all assertions passed');
