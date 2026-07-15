// Parity-golden generator: runs representative specs through the REAL
// Arquero executor (Compiler A, via the built dist) and dumps the results as
// JSON goldens for the Python SQL compiler's parity suite
// (packages/agent/tests/test_query_parity.py).
//
// Run after `pnpm build:toolkit`:
//   node scripts/gen-parity-goldens.mjs
//
// Regenerate whenever transformation semantics change; commit the output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { fromCSV } from 'arquero';
import { useDataSourcesStore } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const sampleData = resolve(here, '../../../sample-data');
const outPath = resolve(here, '../../agent/tests/goldens/parity.json');

setActivePinia(createPinia());
const store = useDataSourcesStore();

// Entities available to specs. The pytest side registers the same CSVs as
// DuckDB views, so both compilers read identical data.
const SOURCES = {
  penguins: 'penguins.csv',
  donors: 'donors.csv',
  samples: 'samples.csv',
};
for (const [name, file] of Object.entries(SOURCES)) {
  const table = fromCSV(readFileSync(join(sampleData, file), 'utf8'));
  store.seedDataSource(name, file, table);
}

const src = (name) => ({ name, source: SOURCES[name] });
const notNull = (f) => ({ op: '!=', left: { field: f }, right: { literal: null } });

// [name, {source, transformation}, selections?, displayDataOnly?]
const CASES = [
  [
    'groupby-rollup-count',
    {
      source: src('penguins'),
      transformation: [
        { groupby: 'species' },
        { rollup: { count: { op: 'count' } } },
      ],
    },
  ],
  [
    'rollup-numeric-aggs',
    {
      source: src('penguins'),
      transformation: [
        { filter: notNull('body_mass_g') },
        { groupby: 'species' },
        {
          rollup: {
            total: { op: 'sum', field: 'body_mass_g' },
            avg: { op: 'mean', field: 'body_mass_g' },
            lo: { op: 'min', field: 'body_mass_g' },
            hi: { op: 'max', field: 'body_mass_g' },
            mid: { op: 'median', field: 'body_mass_g' },
          },
        },
      ],
    },
  ],
  [
    'frequency-rollup',
    {
      source: src('penguins'),
      transformation: [
        { groupby: 'island' },
        { rollup: { freq: { op: 'frequency' } } },
      ],
    },
  ],
  [
    'filter-expr-comparison',
    {
      source: src('penguins'),
      transformation: [
        { filter: notNull('bill_length_mm') },
        {
          filter: {
            op: '&&',
            left: { op: '>', left: { field: 'bill_length_mm' }, right: { literal: 45 } },
            right: { op: '==', left: { field: 'sex' }, right: { literal: 'MALE' } },
          },
        },
        { groupby: 'species' },
        { rollup: { n: { op: 'count' } } },
      ],
    },
  ],
  [
    'derive-ratio-and-ternary',
    {
      source: src('penguins'),
      transformation: [
        { filter: notNull('body_mass_g') },
        { filter: notNull('flipper_length_mm') },
        { groupby: 'species' },
        {
          rollup: {
            mass: { op: 'sum', field: 'body_mass_g' },
            flipper: { op: 'sum', field: 'flipper_length_mm' },
          },
        },
        {
          derive: {
            ratio: { op: '/', left: { field: 'mass' }, right: { field: 'flipper' } },
            size: {
              if: { op: '>', left: { field: 'mass' }, right: { literal: 1_000_000 } },
              then: { literal: 'big' },
              else: { literal: 'small' },
            },
          },
        },
      ],
    },
  ],
  [
    'orderby-rank-ternary',
    {
      source: src('penguins'),
      transformation: [
        { groupby: 'island' },
        { rollup: { n: { op: 'count' } } },
        { orderby: { field: 'n', order: 'desc' } },
        { derive: { rank: { window: 'rank' } } },
        {
          derive: {
            top: {
              if: { op: '==', left: { field: 'rank' }, right: { literal: 1 } },
              then: { literal: 'yes' },
              else: { literal: 'no' },
            },
          },
        },
      ],
    },
  ],
  [
    // NOTE: rolling windows are tie-order-dependent (Arquero breaks ties by
    // stable row order; SQL guarantees nothing), so parity only holds when
    // the orderby key is UNIQUE — hence hubmap_id here, not a measure.
    'rolling-percentile',
    {
      source: src('donors'),
      transformation: [
        { filter: notNull('age_value') },
        { orderby: { field: 'hubmap_id', order: 'asc' } },
        { derive: { total: { agg: 'count' } } },
        {
          derive: {
            percentile: {
              rolling: {
                expression: {
                  op: '/',
                  left: { agg: 'count' },
                  right: { field: 'total' },
                },
              },
            },
          },
        },
        { groupby: 'sex' },
        { rollup: { max_pct: { op: 'max', field: 'percentile' } } },
      ],
    },
  ],
  [
    'groupby-derive-window-agg',
    {
      source: src('penguins'),
      transformation: [
        { filter: notNull('body_mass_g') },
        { groupby: 'species' },
        {
          derive: {
            species_max: { agg: 'max', field: 'body_mass_g' },
            species_n: { agg: 'count' },
          },
        },
        { groupby: ['species', 'species_max', 'species_n'] },
        { rollup: { rows: { op: 'count' } } },
      ],
    },
  ],
  [
    'binby-histogram',
    {
      source: src('penguins'),
      transformation: [
        { filter: notNull('body_mass_g') },
        { binby: { field: 'body_mass_g', bins: 10, nice: true } },
        { rollup: { count: { op: 'count' } } },
      ],
    },
  ],
  [
    'derive-percent-of-max',
    {
      source: src('penguins'),
      transformation: [
        { groupby: 'island' },
        { rollup: { n: { op: 'count' } } },
        {
          derive: {
            pct: {
              op: '/',
              left: { field: 'n' },
              right: { agg: 'max', field: 'n' },
            },
          },
        },
      ],
    },
  ],
  [
    'join-rollup',
    {
      source: [src('donors'), src('samples')],
      transformation: [
        {
          join: { on: ['hubmap_id', 'donor.hubmap_id'] },
          in: ['donors', 'samples'],
          out: 'joined',
        },
        { groupby: 'sex' },
        { rollup: { samples_count: { op: 'count' } } },
      ],
    },
  ],
  [
    'named-filter-same-entity',
    {
      source: src('penguins'),
      transformation: [
        { filter: { name: 'sel_interval', source: 'penguins' } },
        { groupby: 'species' },
        { rollup: { n: { op: 'count' } } },
      ],
    },
    {
      sel_interval: {
        dataSourceKey: 'penguins',
        selection: { body_mass_g: [4000, 5000] },
        type: 'interval',
      },
    },
  ],
  [
    'named-filter-cross-entity',
    {
      source: src('samples'),
      transformation: [
        {
          filter: {
            name: 'sel_donor',
            source: 'donors',
            entityRelationship: {
              originKey: 'hubmap_id',
              targetKey: 'donor.hubmap_id',
            },
          },
        },
        { groupby: 'sample_category' },
        { rollup: { n: { op: 'count' } } },
      ],
    },
    {
      sel_donor: {
        dataSourceKey: 'donors',
        selection: { sex: ['Female'] },
        type: 'point',
      },
    },
  ],
  [
    // A brush whose fields don't exist in the target table (e.g. landed on
    // an aggregated output column): the filter is SKIPPED, not an error —
    // GetMappedArqueroFilter's missing-column guard, mirrored server-side.
    'named-filter-skipped-missing-field',
    {
      source: src('penguins'),
      transformation: [
        { filter: { name: 'sel_agg', source: 'penguins' } },
        { groupby: 'species' },
        { rollup: { n: { op: 'count' } } },
      ],
    },
    {
      sel_agg: {
        dataSourceKey: 'penguins',
        selection: { 'count penguins': [1, 5] },
        type: 'interval',
      },
    },
  ],
  [
    'named-filter-display-vs-extent',
    {
      source: src('penguins'),
      transformation: [
        { filter: { name: 'sel_species', source: 'penguins' } },
        { groupby: 'island' },
        { rollup: { n: { op: 'count' } } },
      ],
    },
    {
      sel_species: {
        dataSourceKey: 'penguins',
        selection: { species: ['Adelie'] },
        type: 'point',
      },
    },
    false, // displayDataOnly: force the extent pass
  ],
];

const goldens = { sources: SOURCES, cases: [] };
for (const [name, spec, selections, displayDataOnly] of CASES) {
  store.clearAllSelections();
  if (selections) store.bindExternalDataSelections(selections);
  const sources = Array.isArray(spec.source) ? spec.source : [spec.source];
  const result = store.getDataObject(
    sources.map((s) => s.name),
    spec.transformation,
    { displayDataOnly: displayDataOnly === true },
  );
  if (!result) throw new Error(`case ${name}: getDataObject returned null`);
  goldens.cases.push({
    name,
    spec,
    selections: selections ?? null,
    displayDataOnly: displayDataOnly ?? null,
    expect: {
      displayData: result.displayData,
      allData: result.allData,
      isSubset: result.isDisplayDataSubset,
    },
  });
  console.log(
    `${name}: display=${result.displayData.length} rows, all=${result.allData.length}, subset=${result.isDisplayDataSubset}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(goldens, null, 2));
console.log(`\nwrote ${goldens.cases.length} cases -> ${outPath}`);
