// Unit test for pipelineOutputFields. Run after `npm run build:all`
// (imports from dist).
import assert from 'node:assert/strict';
import * as aq from 'arquero';
import { pipelineOutputFields } from '../dist/index.js';
import { pipelineOutputFields as reactEntry } from '../dist/react.js';

const FIELDS = {
  patients: ['id', 'birth_date', 'site'],
  visits: ['id', 'visit_date', 'site'],
};

const fields = (spec, sourceFields = FIELDS) => {
  const result = pipelineOutputFields(spec, sourceFields);
  return result === null ? null : [...result].sort();
};

const patients = { name: 'patients', source: 'patients.csv' };

assert.equal(
  typeof reactEntry,
  'function',
  'pipelineOutputFields is exported from the react entry too',
);

assert.deepEqual(
  fields({ source: patients }),
  ['birth_date', 'id', 'site'],
  'no transformation → the source columns',
);

assert.deepEqual(
  fields({ source: patients, transformation: [{ groupby: 'site' }] }),
  ['birth_date', 'id', 'site'],
  'groupby alone keeps every column',
);

assert.deepEqual(
  fields({
    source: patients,
    transformation: [
      { groupby: 'site' },
      { rollup: { 'patient count': { op: 'count' } } },
    ],
  }),
  ['patient count', 'site'],
  'rollup narrows to group keys + aggregate outputs',
);

// The regression this helper exists for: after binby + rollup the binned
// field itself is gone, so a mapping/filter/brush naming it cannot resolve.
const binned = {
  source: patients,
  transformation: [
    { binby: { field: 'birth_date' } },
    { rollup: { 'patient count': { op: 'count' } } },
  ],
};
assert.deepEqual(
  fields(binned),
  ['end', 'patient count', 'start'],
  'binby + rollup → bin bounds + aggregate, not the binned field',
);

assert.deepEqual(
  fields({
    source: patients,
    transformation: [
      {
        binby: {
          field: 'birth_date',
          output: { bin_start: 'lo', bin_end: 'hi' },
        },
      },
      { rollup: { n: { op: 'count' } } },
    ],
  }),
  ['hi', 'lo', 'n'],
  'binby honors custom output names',
);

assert.deepEqual(
  fields({
    source: patients,
    transformation: [
      { binby: { field: 'birth_date' } },
      {
        filter: {
          op: '!=',
          left: { field: 'birth_date' },
          right: { literal: null },
        },
      },
    ],
  }),
  ['birth_date', 'id', 'site'],
  'binby without an aggregate leaves the bin columns unmaterialized (Arquero semantics)',
);

assert.deepEqual(
  fields({
    source: patients,
    transformation: [
      {
        derive: {
          birth_year: {
            op: '+',
            left: { field: 'birth_date' },
            right: { literal: 0 },
          },
        },
      },
    ],
  }),
  ['birth_date', 'birth_year', 'id', 'site'],
  'derive adds its output names',
);

assert.deepEqual(
  fields({
    source: patients,
    transformation: [{ groupby: 'site' }, { kde: { field: 'birth_date' } }],
  }),
  ['density', 'sample', 'site'],
  'kde → group keys + sample/density',
);

assert.deepEqual(
  fields({
    source: [patients, { name: 'visits', source: 'visits.csv' }],
    transformation: [{ in: ['patients', 'visits'], join: { on: 'id' } }],
  }),
  ['birth_date', 'id', 'site_1', 'site_2', 'visit_date'],
  'join: the shared key stays single, other collisions are suffixed',
);

assert.deepEqual(
  fields({
    source: [patients, { name: 'visits', source: 'visits.csv' }],
    transformation: [
      {
        in: ['patients', 'visits'],
        join: { on: [['id'], ['id']] },
        out: 'joined',
      },
      { groupby: 'site_1' },
      { rollup: { n: { op: 'count' } } },
    ],
  }),
  ['n', 'site_1'],
  'multi-key join feeds the rest of the pipeline through `out`',
);

// A two-string `on` is [leftKey, rightKey], not two same-named keys: Arquero
// pairs them, so differently-named keys both survive and everything else that
// collides is suffixed.
assert.deepEqual(
  fields(
    {
      source: [patients, { name: 'visits', source: 'visits.csv' }],
      transformation: [
        { in: ['patients', 'visits'], join: { on: ['id', 'patient_id'] } },
      ],
    },
    { patients: ['id', 'site'], visits: ['patient_id', 'site'] },
  ),
  ['id', 'patient_id', 'site_1', 'site_2'],
  'differently-named join keys both survive; the shared column splits',
);

assert.equal(
  fields({ source: patients }, null),
  null,
  'no source fields → null',
);
assert.equal(
  fields({ source: { name: 'unknown', source: 'x.csv' } }),
  null,
  'unknown source → null',
);
assert.equal(
  fields({ source: patients, transformation: [{ somethingNew: {} }] }),
  null,
  'unrecognized transform → null (no information, not "no fields")',
);
assert.equal(
  fields({
    source: patients,
    transformation: [{ in: 'not_a_table', filter: 'd.id != null' }],
  }),
  null,
  'reference to a table outside the environment → null',
);

// Parity spot-checks against the real Arquero executor: the helper claims to
// mirror it, so compare with tables built the way DataSourcesStore does.
const patientTable = aq.table({
  id: [1, 2],
  birth_date: [2002, 2012],
  site: ['a', 'b'],
});
const visitTable = aq.table({
  id: [1, 2],
  visit_date: [1, 2],
  site: ['a', 'b'],
});

const arqueroBinned = patientTable
  .groupby({
    start: 'd => op.bin(d.birth_date, 2000, 2020, 10, 0)',
    end: 'd => op.bin(d.birth_date, 2000, 2020, 10, 1)',
  })
  .rollup({ 'patient count': aq.op.count() });
assert.deepEqual(
  arqueroBinned.columnNames().sort(),
  fields(binned),
  'binby + rollup matches the Arquero executor',
);

assert.deepEqual(
  patientTable.join(visitTable, 'id').columnNames().sort(),
  fields({
    source: [patients, { name: 'visits', source: 'visits.csv' }],
    transformation: [{ in: ['patients', 'visits'], join: { on: 'id' } }],
  }),
  'join collision suffixes match the Arquero executor',
);

console.log('pipeline-fields: all assertions passed');
