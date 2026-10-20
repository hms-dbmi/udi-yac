/**
 * A selection on one entity filters a related one through their key, however
 * many origin rows it keeps.
 *
 * Run with: node test/cross-entity-filter.mjs   (after pnpm build:toolkit)
 *
 * The mapped filter used to be an expression OR-ing one `d[key] === id` per
 * selected origin row. A brush over most of a large table (HuBMAP datasets by
 * timestamp, filtering donors) wrote thousands of terms, and parsing the chain
 * recursed once per term until the stack ran out — "too much recursion" in
 * Firefox, whose stack is the smaller one.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const store = useDataSourcesStore();
const aq = await import('arquero');

// 100,000 datasets over 500 donors; a brush keeps the first 60,000 datasets,
// which belong to donors D0–D299.
const N = 100_000;
store.seedDataSource(
  'datasets',
  'datasets',
  aq.table({
    t: Array.from({ length: N }, (_, i) => i),
    donor_id: Array.from({ length: N }, (_, i) => `D${Math.floor(i / 200)}`),
  }),
);
store.seedDataSource(
  'donors',
  'donors',
  aq.table({ hubmap_id: Array.from({ length: 500 }, (_, i) => `D${i}`) }),
);
store.bindExternalDataSelections({
  brush: { dataSourceKey: 'datasets', type: 'interval', selection: { t: [0, 59_999] } },
});

for (const match of ['any', 'all']) {
  const donors = store.getDataObject(
    ['donors'],
    [
      {
        filter: {
          name: 'brush',
          source: 'datasets',
          match,
          entityRelationship: { originKey: 'donor_id', targetKey: 'hubmap_id' },
        },
        in: 'donors',
        out: 'donors',
      },
    ],
  ).displayData;
  assert.equal(donors.length, 300, match);
  assert.equal(donors.at(-1).hubmap_id, 'D299', match);
}

console.log('cross-entity-filter: all assertions passed');
