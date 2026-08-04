/**
 * `spreadLabels` — what a text layer's `avoidOverlap` does to its positions.
 *
 * Run with: node test/label-layout.mjs   (after pnpm build:toolkit)
 *
 * Two survival curves ending at the same percentage put their labels on the same
 * point, and both become unreadable. Nudging them apart is layout, not data, so it
 * happens on a column of its own: the original positions (which the reference
 * lines still point at) are left untouched.
 */
import assert from 'node:assert/strict';
import { spreadLabels } from '../dist/index.js';

const OUT = '__spread';
const spread = (rows, opts) => {
  spreadLabels(rows, { positionField: 'y', outField: OUT, minGap: 4, ...opts });
  return rows.map((r) => r[OUT]);
};

// 1. Labels already far enough apart are left exactly where they were.
assert.deepEqual(
  spread([{ y: 10 }, { y: 40 }, { y: 90 }]),
  [10, 40, 90],
  'a non-colliding layout must not be disturbed',
);

// 2. An exact tie — the case that motivated this — is separated by the gap, and
//    the lower of the two keeps its true position.
assert.deepEqual(spread([{ y: 84 }, { y: 84 }]), [84, 88]);

// 3. A cluster is spread cumulatively, not just pairwise.
assert.deepEqual(spread([{ y: 50 }, { y: 51 }, { y: 52 }]), [50, 54, 58]);

// 4. Input order does not matter: rows are placed by value, in place.
assert.deepEqual(spread([{ y: 52 }, { y: 50 }, { y: 51 }]), [58, 50, 54]);

// 5. Rows the layer would not draw are excluded and marked null rather than being
//    given a position. A template suppresses a label by nulling its *other* axis
//    (here x), and every row of a group carries the same y.
assert.deepEqual(
  spread([{ y: 84, x: 10 }, { y: 84, x: null }, { y: 84 }, { y: 90, x: 10 }], {
    requiredField: 'x',
  }),
  [84, null, null, 90],
  'only drawable rows should take part, and 84/90 already clear the gap',
);

// 6. Non-numeric positions are skipped, not coerced.
assert.deepEqual(spread([{ y: null }, { y: 'x' }, { y: 20 }]), [null, null, 20]);

// 7. Pushing up would leave the axis, so the whole cluster shifts down instead —
//    a squashed label is recoverable, one drawn off the plot is not.
assert.deepEqual(
  spread([{ y: 98 }, { y: 98 }, { y: 98 }], { limit: { min: 0, max: 100 } }),
  [92, 96, 100],
);

// 8. When there is genuinely no room, what cannot be resolved stays *inside* the
//    plot: a stack of labels is readable one at a time, labels outside the axis
//    are not drawn at all.
const crowded = spread([{ y: 5 }, { y: 5 }, { y: 5 }, { y: 5 }], {
  minGap: 4,
  limit: { min: 4, max: 10 },
});
assert.deepEqual(crowded, [4, 8, 10, 10], 'the unresolvable excess should pile up at the end');

// 9. The position field itself is never rewritten — the rule a label annotates
//    still points at the real value.
const rows = [{ y: 84 }, { y: 84 }];
spreadLabels(rows, { positionField: 'y', outField: OUT, minGap: 4 });
assert.deepEqual(
  rows.map((r) => r.y),
  [84, 84],
  'the original positions must survive for the layers that read them',
);

console.log('label-layout: all assertions passed');
