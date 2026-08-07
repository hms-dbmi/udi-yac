/**
 * A changeset must be given *fresh* row objects, or the marks go stale.
 *
 * Run with: node test/changeset-identity.mjs   (after pnpm build:toolkit)
 *
 * Vega tags every datum it ingests with an internal id. A changeset that removes
 * all rows and re-inserts the SAME object identities cancels out in its dataflow:
 * the encoders never re-run, so marks keep their previous positions even though
 * `view.data()` reports the new values. Correct data, wrong picture.
 *
 * That is reachable in the toolkit because `getDataObject` memoizes and hands back
 * the same row-object array for a repeat query, and the render path used to pass
 * those objects straight through — mutating them in place along the way (the label
 * layout writes a column). Reported from YAC as survival curves rendering wrongly
 * after a filter and correcting themselves when the card was toggled to table view
 * and back: toggling re-embeds, which ingests fresh tuples.
 *
 * `UDIVis` now copies the rows before handing them over. This pins the vega
 * behaviour that makes the copy necessary, so the copy can never be "optimized"
 * away without the reason resurfacing.
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';

const spec = compile({
  data: { name: 'udi_data' },
  layer: [
    {
      mark: { type: 'line' },
      encoding: {
        x: { field: 'x', type: 'quantitative', scale: { domain: [0, 10] } },
        y: { field: 'y', type: 'quantitative', scale: { domain: [0, 100] } },
      },
    },
  ],
});

const linePath = async (view) => {
  const svg = await view.toSVG();
  return svg.match(/<path[^>]*aria-label[^>]*d="([^"]+)"/)?.[1] ?? null;
};

async function render(rows, nextRows) {
  const view = new vega.View(vega.parse(spec.spec), { renderer: 'none' });
  view.change('udi_data', vega.changeset().insert(rows));
  await view.resize().runAsync();
  const before = await linePath(view);

  view.change('udi_data', vega.changeset().remove(() => true).insert(nextRows));
  await view.resize().runAsync();
  return { before, after: await linePath(view), view };
}

// 1. The trap: the same objects, mutated in place, then re-inserted. This is what
//    a memoized query plus an in-place column write produces.
const shared = [
  { x: 0, y: 50 },
  { x: 10, y: 50 },
];
const reused = await render(shared, shared.map((row) => Object.assign(row, { y: 20 })));
assert.equal(
  reused.before,
  reused.after,
  'reusing tuple identities should leave the mark stale — the behaviour being guarded',
);
// And the view genuinely holds the new values, which is why this is so hard to
// spot from the data side: only the picture is wrong.
assert.deepEqual(
  reused.view.data('udi_data').map((r) => r.y),
  [20, 20],
  'the view should report the updated data even while drawing the old',
);

// 2. Fresh objects — what UDIVis now passes — update the mark.
const copied = await render(
  [
    { x: 0, y: 50 },
    { x: 10, y: 50 },
  ],
  [
    { x: 0, y: 20 },
    { x: 10, y: 20 },
  ],
);
assert.notEqual(copied.before, copied.after, 'fresh identities must move the mark');

// 3. The copy is shallow, so pin that a shallow copy is enough: same values, new
//    identity. (A deep copy would be needed only if vega tagged nested objects,
//    which it does not — rows are flat.)
const source = [
  { x: 0, y: 50 },
  { x: 10, y: 50 },
];
const shallow = await render(
  source.map((r) => ({ ...r })),
  source.map((r) => ({ ...r, y: 20 })),
);
assert.equal(shallow.after, copied.after, 'a shallow copy per row is sufficient');

console.log('changeset-identity: all assertions passed');
