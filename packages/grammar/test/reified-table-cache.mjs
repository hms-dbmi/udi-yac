// Guards the source-table copy cache in DataSourcesStore.getDataObject.
//
// `from(dest.reify())` is a full column-wise copy of a source table (265ms for
// HuBMAP's 9474 x 258 `datasets`) and used to run on every getDataObject call.
// It is now cached per source, keyed on tablesVersion. That is only safe while
// nothing mutates a cached table in place — PerformDataTransformations writes
// intermediate results back into the *Map* it is handed (setOutTable), and
// Arquero operators return new tables. If either assumption ever breaks, one
// query would corrupt the source for the next one.
//
// Run after `npm run build:all` (imports from dist).
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { from } from 'arquero';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const store = useDataSourcesStore();

const rows = [
  { id: 1, species: 'Adelie', mass: 3750 },
  { id: 2, species: 'Adelie', mass: 3800 },
  { id: 3, species: 'Gentoo', mass: 5000 },
  { id: 4, species: 'Chinstrap', mass: 3650 },
];
store.seedDataSource('penguins', './penguins.csv', from(rows));

const ids = (result) => result.displayData.map((r) => r.id);

// ── a filtered query must not shrink the cached source ────────────────────────
const filtered = store.getDataObject(
  ['penguins'],
  [
    {
      filter: {
        op: '==',
        left: { field: 'species' },
        right: { literal: 'Adelie' },
      },
    },
  ],
);
assert.deepEqual(ids(filtered), [1, 2], 'filter narrows to the Adelie rows');

const unfiltered = store.getDataObject(['penguins'], []);
assert.deepEqual(
  ids(unfiltered),
  [1, 2, 3, 4],
  'source still has every row after a filtered query — the cached copy was not mutated',
);

// ── a rollup, then row-level again ───────────────────────────────────────────
const rolled = store.getDataObject(
  ['penguins'],
  [{ groupby: 'species' }, { rollup: { n: { op: 'count' } } }],
);
assert.equal(rolled.displayData.length, 3, 'rollup yields one row per species');

const afterRollup = store.getDataObject(['penguins'], []);
assert.deepEqual(
  ids(afterRollup),
  [1, 2, 3, 4],
  'source survives a groupby+rollup pipeline',
);

// ── derive must not add its column to the cached source ──────────────────────
const derived = store.getDataObject(
  ['penguins'],
  [{ derive: { heavy: 'd => d.mass > 4000' } }],
);
assert.ok(
  'heavy' in derived.displayData[0],
  'derive adds its column to the result',
);

const afterDerive = store.getDataObject(['penguins'], []);
assert.ok(
  !('heavy' in afterDerive.displayData[0]),
  'derived column did not leak into the cached source',
);

// ── reseeding bumps tablesVersion, which must drop the cache ─────────────────
store.seedDataSource(
  'penguins',
  './penguins.csv',
  from([{ id: 9, species: 'Emperor', mass: 22000 }]),
);
const reseeded = store.getDataObject(['penguins'], []);
assert.deepEqual(ids(reseeded), [9], 'reseeding invalidates the cached copy');

console.log('reified-table-cache: all assertions passed');
