// Guards the order of computed categorical domains.
//
// UDIVis hands Vega-Lite an explicit domain for every categorical encoding, and
// Vega-Lite takes an explicit domain as-is: its order is the axis order, the
// legend order and the color assignment. It used to be the order in which the
// rows first mentioned each value — which a filter changes — so bars reshuffled
// and changed color whenever a filter applied. The domain must depend on the
// values alone.
//
// Imports the TypeScript source directly — Node strips the types.
import assert from 'node:assert/strict';
import { orderCategories } from '../domainCompute.ts';

// Alphabetical, digit runs compared as numbers, nulls last.
assert.deepEqual(
  orderCategories(
    [{ k: 'b' }, { k: null }, { k: '10' }, { k: 'a' }, { k: '2' }, { k: 'b' }],
    'k',
  ),
  ['2', '10', 'a', 'b', null],
);

// Numbers and dates compare by value, so negatives order correctly.
assert.deepEqual(
  orderCategories([{ k: -5 }, { k: 3 }, { k: -10 }], 'k'),
  [-10, -5, 3],
);
const d = (iso) => new Date(iso);
assert.deepEqual(
  orderCategories([{ k: d('2021-03-01') }, { k: d('2020-12-01') }], 'k').map(
    (v) => v.toISOString().slice(0, 10),
  ),
  ['2020-12-01', '2021-03-01'],
);

// Row order does not matter — a filtered subset keeps its relative order.
const rows = [
  { k: 'Male', race: 'White', count: 5 },
  { k: 'Female', race: 'Black', count: 2 },
  { k: 'Female', race: 'White', count: 4 },
  { k: 'Male', race: 'Asian', count: 0 },
  { k: 'Unknown', race: 'White', count: 9 },
];
assert.deepEqual(orderCategories(rows, 'k'), ['Female', 'Male', 'Unknown']);
assert.deepEqual(orderCategories([...rows].reverse(), 'k'), [
  'Female',
  'Male',
  'Unknown',
]);

// By total: stacked rows sum per category, largest first.
assert.deepEqual(orderCategories(rows, 'k', 'count'), [
  'Unknown',
  'Female',
  'Male',
]);

// Ties by total fall back to alphabetical; non-numeric totals count as 0.
assert.deepEqual(
  orderCategories(
    [
      { k: 'b', n: 1 },
      { k: 'a', n: 1 },
      { k: 'c', n: 'x' },
    ],
    'k',
    'n',
  ),
  ['a', 'b', 'c'],
);

console.log('category-order: ok');
