/**
 * queryData binds the caller's selections before its first await.
 *
 * Run with: node test/query-data-bind.mjs   (after pnpm build:toolkit)
 *
 * A host's selections are a snapshot of its own state. Bound after awaiting
 * the sources, a snapshot taken before a brush move overwrote the newer filter
 * another chart had bound meanwhile, and every chart flicked back to the older
 * filter for a frame.
 */
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import { queryData, getDataSelections } from '../dist/ce.js';

const selection = {
  'col:donors.age': { dataSourceKey: 'donors', type: 'interval', selection: { age: [20, 40] } },
};
const pending = queryData({ source: { name: 'donors', source: 'missing.csv' } }, selection);
// Not awaited: the bind has to have happened already.
assert.deepEqual(getDataSelections()['col:donors.age'], selection['col:donors.age']);
await pending.catch(() => undefined);

console.log('query-data-bind: all assertions passed');
