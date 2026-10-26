/**
 * `rank()` shares a rank between tied rows — so ordering needs a tiebreak.
 *
 * Run with: node test/orderby-rank.mjs   (after pnpm build:toolkit)
 *
 * Templates use `rank() == 1` to mean "one row of this group", to hang an
 * annotation on. That is only true if the order has no ties: with dozens of
 * subjects sharing a time, `orderby(time)` gives every one of them rank 1 (and no
 * row at all gets rank 2), which silently multiplies a label into a stack of
 * identical copies. A second order key makes rank a row number.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());

const ROWS = [
  { id: 'a', day: 0 },
  { id: 'b', day: 0 },
  { id: 'c', day: 0 },
  { id: 'd', day: 5 },
];

const store = useDataSourcesStore();
const aq = await import('arquero');
store.seedDataSource('inline', 'inline', aq.from(ROWS));

const ranks = (orderby) => {
  const result = store.getDataObject(
    ['inline'],
    [{ orderby }, { derive: { r: { window: 'rank' } } }],
  );
  assert.ok(result, 'expected a result table');
  return Object.fromEntries(result.displayData.map((row) => [row.id, row.r]));
};

// 1. Ties share a rank, and the next rank skips past them. Three rows answer to
//    "rank == 1"; nothing answers to "rank == 2".
assert.deepEqual(ranks('day'), { a: 1, b: 1, c: 1, d: 4 });

// 2. A tiebreak makes rank a row number. This is the `{field: [...]}` shape
//    grammar-py's `.orderby([a, b])` emits.
assert.deepEqual(ranks({ field: ['day', 'id'], order: 'asc' }), {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
});

// 3. The list-of-keys spelling is equivalent.
assert.deepEqual(
  ranks([
    { field: 'day', order: 'asc' },
    { field: 'id', order: 'asc' },
  ]),
  { a: 1, b: 2, c: 3, d: 4 },
);

// 4. A direction applies to every field named alongside it.
assert.deepEqual(ranks({ field: ['day', 'id'], order: 'desc' }), {
  d: 1,
  c: 2,
  b: 3,
  a: 4,
});

console.log('orderby-rank: all assertions passed');
