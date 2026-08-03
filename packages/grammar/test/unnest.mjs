/**
 * `unnest` expands a delimited multi-value column into one row per value.
 *
 * Run with: node test/unnest.mjs   (after pnpm build:toolkit)
 *
 * The behaviour that matters: a column holding a set must produce one row per
 * member, so grouping on it yields real categories instead of one category per
 * distinct combination. Verified against the shape that motivated it — PCX's
 * `tumor_locations`, where 78 raw combinations cover only 22 actual locations.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());

const ROWS = [
  { id: 'a', locations: 'Spine;Brain', n: 1 },
  { id: 'b', locations: 'Spine', n: 2 },
  // Whitespace around the separator must not create distinct categories.
  { id: 'c', locations: 'Brain; Spine ', n: 3 },
  { id: 'd', locations: '', n: 4 },
  { id: 'e', locations: null, n: 5 },
];

const store = useDataSourcesStore();

// seedDataSource installs a pre-parsed table, so the test needs no HTTP.
const aq = await import('arquero');
store.seedDataSource('inline', 'inline', aq.from(ROWS));

function run(transformation) {
  const result = store.getDataObject(['inline'], transformation);
  assert.ok(result, 'expected a result table');
  return result.displayData;
}

// 1. one row per value, whitespace trimmed, empty/null dropped
const expanded = run([{ unnest: { field: 'locations' } }]);
assert.equal(expanded.length, 5, `expected 5 expanded rows, got ${expanded.length}`);
const pairs = expanded.map((r) => `${r.id}:${r.locations}`).sort();
assert.deepEqual(pairs, ['a:Brain', 'a:Spine', 'b:Spine', 'c:Brain', 'c:Spine']);

// 2. other columns are carried onto every produced row
const a = expanded.filter((r) => r.id === 'a');
assert.deepEqual(
  a.map((r) => r.n),
  [1, 1],
  'sibling columns must be copied to each expanded row',
);

// 3. grouping now yields real categories, not combinations
const counts = run([
  { unnest: { field: 'locations' } },
  { groupby: 'locations' },
  { rollup: { subjects: { op: 'count' } } },
]);
const byLocation = Object.fromEntries(counts.map((r) => [r.locations, r.subjects]));
assert.deepEqual(byLocation, { Spine: 3, Brain: 2 });

// 4. a custom separator and an explicit output column
const custom = run([
  { unnest: { field: 'locations', separator: ';', out: 'location' } },
  { groupby: 'location' },
  { rollup: { subjects: { op: 'count' } } },
]);
assert.deepEqual(
  Object.fromEntries(custom.map((r) => [r.location, r.subjects])),
  { Spine: 3, Brain: 2 },
  'out should write values into the named column',
);
// The original column survives when `out` is given elsewhere.
assert.ok('locations' in run([{ unnest: { field: 'locations', out: 'location' } }])[0]);

console.log('unnest: all assertions passed');
