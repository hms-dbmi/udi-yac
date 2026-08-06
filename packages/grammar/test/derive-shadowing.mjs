/**
 * A `derive` that reuses an existing column's name REPLACES it in Arquero — and
 * the SQL backend does not agree.
 *
 * Run with: node test/derive-shadowing.mjs   (after pnpm build:toolkit)
 *
 * Found while adding parity coverage for the stratified survival templates. The
 * compiler emits a derive as `SELECT *, <expr> AS "island" FROM ...`, which leaves
 * the relation holding *two* columns called `island`; a later aggregate resolves
 * the first one, so the derived values are ignored. Arquero replaces the column, so
 * the two executors return different numbers for the same spec.
 *
 * No template does this today (verified across all 68), and the survival templates
 * deliberately derive into a fresh name for exactly this reason. This pins the
 * Arquero half of the contract so that if the SQL side is ever fixed, or a template
 * starts relying on replacement, the expectation is written down rather than
 * rediscovered from a wrong chart.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());

const ROWS = [
  { species: 'Adelie', island: 'Torgersen' },
  { species: 'Adelie', island: 'Biscoe' },
  { species: 'Gentoo', island: 'Biscoe' },
];

const store = useDataSourcesStore();
const aq = await import('arquero');
store.seedDataSource('birds', 'birds', aq.from(ROWS));

const run = (transformation) => store.getDataObject(['birds'], transformation).displayData;

// Keep the value for one species, null it for the rest — writing back to the same
// column name.
const shadowing = [
  {
    derive: {
      island: {
        if: { op: '==', left: { field: 'species' }, right: { literal: 'Adelie' } },
        then: { field: 'island' },
        else: { literal: null },
      },
    },
  },
];

// Row-wise, the derive has replaced the column: Gentoo's island is gone.
const rows = run(shadowing);
assert.deepEqual(
  rows.map((r) => `${r.species}:${r.island ?? '-'}`),
  ['Adelie:Torgersen', 'Adelie:Biscoe', 'Gentoo:-'],
  'a same-name derive should replace the column, not shadow it',
);

// And an aggregate over that name sees the replaced values, so Gentoo has none.
// The SQL backend returns 'Biscoe' here instead — the divergence this file exists
// to document. Prefer a fresh output name in any spec that must run server-side.
const grouped = run([
  ...shadowing,
  { groupby: 'species' },
  { rollup: { island: { op: 'max', field: 'island' } } },
]);
assert.deepEqual(
  Object.fromEntries(grouped.map((r) => [r.species, r.island ?? null])),
  { Adelie: 'Torgersen', Gentoo: null },
  'an aggregate should read the derived values, not the originals',
);

console.log('derive-shadowing: all assertions passed');
