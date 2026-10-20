/**
 * `kde` must estimate the density of the values themselves.
 *
 * Run with: node test/kde-values.mjs   (after pnpm build:toolkit)
 *
 * It once read them through a Uint32Array (Arquero's partition type), whose
 * `.map` truncated every value to an unsigned 32-bit integer: epoch-ms dates
 * overflowed, and the density came out 0 everywhere.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const store = useDataSourcesStore();
const aq = await import('arquero');

const DAY = 86_400_000;
const START = Date.UTC(2021, 0, 1);
// 100 epoch-ms dates, one a day.
const rows = Array.from({ length: 100 }, (_, i) => ({ t: START + i * DAY }));
store.seedDataSource('inline', 'inline', aq.from(rows));

const kde = store.getDataObject(
  ['inline'],
  [{ kde: { field: 't', output: { sample: 't', density: 'density' } } }],
).displayData;

const densities = kde.map((d) => d.density);
assert.ok(Math.max(...densities) > 0, 'density is 0 everywhere');
// About 1/100 per day across the range.
for (const at of [0.25, 0.75]) {
  const perDay = kde[Math.floor(kde.length * at)].density * DAY;
  assert.ok(
    perDay > 0.005 && perDay < 0.02,
    `density at ${at}: ${perDay} per day`,
  );
}

console.log('kde-values: all assertions passed');
