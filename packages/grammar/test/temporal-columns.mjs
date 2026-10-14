// Guards which columns render as dates.
//
// A data package marks an epoch-ms column with `udi:time_format`; the renderers
// show it, and anything still holding a point in time after the transformations,
// as a date. A column that only reuses the name (a count, a derive) must not.
//
// Imports the TypeScript source directly — Node strips the types.
import assert from 'node:assert/strict';
import { setTimeFormats, timeColumns, isEpochMs } from '../temporal.ts';

setTimeFormats({
  datasets: { created_timestamp: 'epoch_ms', published_timestamp: 'epoch_ms' },
  donors: { last_modified_timestamp: 'epoch_ms' },
});

const datasets = { name: 'datasets', source: './datasets.tsv' };

// A source column is a date; another entity's isn't.
let cols = timeColumns({ source: datasets });
assert.ok(isEpochMs(cols, 'created_timestamp'));
assert.ok(!isEpochMs(cols, 'last_modified_timestamp'));

// min/max/mean/median of a date stay dates; count doesn't, even under a date's name.
cols = timeColumns({
  source: [datasets],
  transformation: [
    { groupby: 'dataset_type' },
    {
      rollup: {
        newest: { op: 'max', field: 'created_timestamp' },
        typical: { op: 'median', field: 'created_timestamp' },
        published_timestamp: { op: 'count' },
      },
    },
  ],
});
assert.ok(isEpochMs(cols, 'newest'));
assert.ok(isEpochMs(cols, 'typical'));
assert.ok(!isEpochMs(cols, 'published_timestamp'));

// A binby over a date gives date bin edges, named or default.
cols = timeColumns({
  source: datasets,
  transformation: [
    { binby: { field: 'created_timestamp', output: { bin_start: 'from' } } },
  ],
});
assert.ok(isEpochMs(cols, 'from'));
assert.ok(isEpochMs(cols, 'end'));

// A kde over a date samples dates; its density isn't one.
cols = timeColumns({
  source: datasets,
  transformation: [{ kde: { field: 'created_timestamp' } }],
});
assert.ok(isEpochMs(cols, 'sample'));
assert.ok(!isEpochMs(cols, 'density'));

// A derive under a date's name replaces it.
cols = timeColumns({
  source: datasets,
  transformation: [
    { derive: { created_timestamp: 'd.created_timestamp / 1000' } },
  ],
});
assert.ok(!isEpochMs(cols, 'created_timestamp'));

// A format the renderers don't handle yet is tracked but not rendered.
setTimeFormats({ datasets: { start_datetime: '%Y-%m-%d %H:%M' } });
cols = timeColumns({ source: datasets });
assert.equal(cols.get('start_datetime'), '%Y-%m-%d %H:%M');
assert.ok(!isEpochMs(cols, 'start_datetime'));

console.log('temporal-columns test passed ✓');
