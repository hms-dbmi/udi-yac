// Unit test for the `only` transformation — marginal selection over a
// pre-aggregated powerset cube.
//
// A cube stores one row per dimension-subset combination: participating
// dimensions populated, every other dimension null, measure pre-aggregated
// over the matching line-item rows. `only` names the dimensions it wants and
// resolves the null complement from the source's registered cube metadata,
// so a spec never has to enumerate `== null` conjuncts.
//
// Also covers the expand -> filter -> contract pipeline this operator exists
// to serve: filtering a cube means reading a WIDER marginal, applying the
// predicate, then rolling back up to the visualization's own marginal.
//
// Run after `npm run build:all` (imports from dist).
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { from } from 'arquero';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const store = useDataSourcesStore();

// Line-level truth the cube below is built from — 10 penguins.
const lineItems = [
  { species: 'Adelie', island: 'Biscoe', n: 1 },
  { species: 'Adelie', island: 'Dream', n: 2 },
  { species: 'Adelie', island: 'Torgersen', n: 3 },
  { species: 'Gentoo', island: 'Biscoe', n: 4 },
];

// The full powerset cube: grand total, each single-dimension marginal, and
// the species x island cells.
const cube = [
  { species: null, island: null, cnt: 10 },
  { species: 'Adelie', island: null, cnt: 6 },
  { species: 'Gentoo', island: null, cnt: 4 },
  { species: null, island: 'Biscoe', cnt: 5 },
  { species: null, island: 'Dream', cnt: 2 },
  { species: null, island: 'Torgersen', cnt: 3 },
  ...lineItems.map((r) => ({ species: r.species, island: r.island, cnt: r.n })),
];

store.seedDataSource('penguin_cube', './penguin_cube.csv', from(cube));
store.setCubeMetadata('penguin_cube', {
  dimensions: ['species', 'island'],
  measures: ['cnt'],
});

const rows = (transformation) =>
  store.getDataObject(['penguin_cube'], transformation, {
    displayDataOnly: true,
  }).displayData;

// ── metadata registration ────────────────────────────────────────────────────
assert.equal(store.isCubeSource('penguin_cube'), true);
assert.equal(store.isCubeSource('penguins'), false);
assert.deepEqual(store.getCubeMetadata('penguin_cube'), {
  dimensions: ['species', 'island'],
  measures: ['cnt'],
});
assert.equal(store.getCubeMetadata('penguins'), null);

// ── marginal selection ───────────────────────────────────────────────────────
assert.deepEqual(
  rows([{ only: 'species' }]),
  [
    { species: 'Adelie', island: null, cnt: 6 },
    { species: 'Gentoo', island: null, cnt: 4 },
  ],
  'only: species selects the species marginal (island null)',
);

assert.deepEqual(
  rows([{ only: [] }]),
  [{ species: null, island: null, cnt: 10 }],
  'only: [] selects the grand-total row',
);

assert.equal(
  rows([{ only: ['species', 'island'] }]).length,
  4,
  'only: [species, island] selects the joint marginal',
);

// A string and a single-element array must mean the same thing.
assert.deepEqual(
  rows([{ only: 'species' }]),
  rows([{ only: ['species'] }]),
  'string and single-element array forms agree',
);

// ── the inline `dimensions` escape hatch ─────────────────────────────────────
store.seedDataSource('unregistered', './unregistered.csv', from(cube));
assert.deepEqual(
  store
    .getDataObject(
      ['unregistered'],
      [{ only: 'species', dimensions: ['species', 'island'] }],
      { displayDataOnly: true },
    )
    .displayData.map((r) => r.species),
  ['Adelie', 'Gentoo'],
  'inline dimensions serve a source with no registered cube metadata',
);

// ── error paths ──────────────────────────────────────────────────────────────
assert.throws(
  () =>
    store.getDataObject(['unregistered'], [{ only: 'species' }], {
      displayDataOnly: true,
    }),
  /requires cube metadata/,
  'a source with no cube metadata and no inline dimensions is an error',
);

assert.throws(
  () => rows([{ only: 'not_a_dimension' }]),
  /non-dimension field/,
  'naming a field that is not a cube dimension is an error',
);

// ── expand -> filter -> contract ─────────────────────────────────────────────
// The reference case: counts by species, filtered to Biscoe. Reading the
// species marginal and intersecting it with island == 'Biscoe' is provably
// empty (that marginal has island null); the correct operation is to read
// the species x island marginal, filter, then roll back up to per-species.
const expanded = rows([
  { only: ['species', 'island'] },
  {
    filter: {
      op: '==',
      left: { field: 'island' },
      right: { literal: 'Biscoe' },
    },
  },
  { groupby: ['species'] },
  { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
]);
assert.deepEqual(
  expanded,
  [
    { species: 'Adelie', cnt: 1 },
    { species: 'Gentoo', cnt: 4 },
  ],
  'expand/filter/contract yields per-species counts within Biscoe',
);

// Contracting the UNfiltered joint marginal must reproduce the species
// marginal the cube stores directly — the identity that makes contraction
// exact for additive measures.
const contractedAll = rows([
  { only: ['species', 'island'] },
  { groupby: ['species'] },
  { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
]);
assert.deepEqual(
  contractedAll,
  [
    { species: 'Adelie', cnt: 6 },
    { species: 'Gentoo', cnt: 4 },
  ],
  'contracting the unfiltered joint marginal equals the stored species marginal',
);

// And the same identity against the line-level truth, so the fixture itself
// cannot drift into agreeing with a wrong implementation.
const truth = new Map();
for (const r of lineItems) {
  truth.set(r.species, (truth.get(r.species) ?? 0) + r.n);
}
for (const row of contractedAll) {
  assert.equal(
    row.cnt,
    truth.get(row.species),
    `contracted count for ${row.species} matches the line-level total`,
  );
}

console.log('cube-only: all assertions passed');
