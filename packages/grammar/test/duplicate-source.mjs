/**
 * A spec may name the same source twice, and must still render.
 *
 * Run with: node test/duplicate-source.mjs   (after pnpm build:toolkit)
 *
 * The agent's survival templates declare a source per ROLE — the event log, the
 * table the stratifier lives in, the table the censoring status lives in — and
 * two of those roles can land on one table (pcx's Patient carries both
 * `age_at_diagnosis` and `vital_status`). The resolved spec then lists Patient
 * twice. `namedTables` is keyed by name, so the duplicate collapses; comparing
 * its size against `keys.length` counted that as a source still loading and
 * `getDataObject` returned null forever. Blank chart, no error anywhere.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const aq = await import('arquero');
const store = useDataSourcesStore();

store.seedDataSource(
  'events',
  'events',
  aq.from([
    { id: 'p1', kind: 'start', day: 0 },
    { id: 'p2', kind: 'start', day: 0 },
  ]),
);
store.seedDataSource(
  'people',
  'people',
  aq.from([
    { id: 'p1', age: 10 },
    { id: 'p2', age: 20 },
  ]),
);

const transformation = [
  { join: { on: ['id', 'id'] }, in: ['events', 'people'], out: 'joined' },
];

const once = store.getDataObject(['events', 'people'], transformation);
assert.ok(once, 'the plain two-source form should resolve');

// The same request, with one source named twice — what the resolved template
// emits when two of its roles share a table.
const twice = store.getDataObject(
  ['events', 'people', 'people'],
  transformation,
);
assert.ok(twice, 'a duplicated source name must not read as a missing table');
assert.deepEqual(twice.displayData, once.displayData);

// And the guard it must not weaken: a source that genuinely has not loaded
// still holds the pipeline back.
assert.equal(
  store.getDataObject(['events', 'people', 'absent'], transformation),
  null,
  'a genuinely missing source must still return null',
);

console.log('Duplicate-source test passed ✓');
