#!/usr/bin/env node
/**
 * Generate `sample-data/penguins_cube/` — a pre-aggregated powerset cube
 * over the bundled penguins CSV.
 *
 * The team's real cube fixtures live under the gitignored `sample-data/pcx/`,
 * so nothing exercising the cube code path could run in CI, Storybook, or a
 * fresh clone. This derives an equivalent (tiny) cube from data that IS in
 * the repo, so the cube-aware filtering path has a committed fixture.
 *
 * Shape: one row per subset of {species, island, sex} — dimensions in the
 * subset populated, the rest null — with `cnt` the number of penguins in
 * that cell and `mean_body_mass_g` a deliberately NON-additive companion
 * measure (so the "refuse to contract" path has something to refuse).
 *
 * MISSING VALUES. 11 of the 344 penguins have no recorded sex. A cube writes
 * an empty cell to mean "this dimension does not participate in this
 * marginal", so a genuinely-missing value cannot also be written as empty —
 * the two would be indistinguishable, and marginal selection would silently
 * mix them. They get an explicit label instead (`--null-label`, default
 * "(missing)"), which keeps them countable: every marginal then totals 344,
 * matching the penguins table. `--drop-nulls` excludes those rows instead,
 * at the cost of totals that no longer reconcile with the source.
 *
 * Usage:
 *   node scripts/gen-penguins-cube.mjs
 *   node scripts/gen-penguins-cube.mjs --drop-nulls
 *   node scripts/gen-penguins-cube.mjs --null-label Unknown
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_CSV = join(REPO_ROOT, 'sample-data', 'penguins', 'penguins.csv');
const OUT_DIR = join(REPO_ROOT, 'sample-data', 'penguins_cube');

const DIMENSIONS = ['species', 'island', 'sex'];
const MEASURE = 'cnt';
const MEAN_MEASURE = 'mean_body_mass_g';

/** Minimal CSV reader — the penguins fixture has no quoted fields. */
function readRows(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']));
  });
}

/** Every subset of `items`, smallest first — the cube's marginal list. */
function powerset(items) {
  const subsets = [[]];
  for (const item of items) {
    for (const existing of [...subsets]) subsets.push([...existing, item]);
  }
  return subsets.sort((a, b) => a.length - b.length);
}

const argv = process.argv.slice(2);
const dropNulls = argv.includes('--drop-nulls');
const nullLabelIndex = argv.indexOf('--null-label');
const NULL_LABEL = nullLabelIndex >= 0 ? argv[nullLabelIndex + 1] : '(missing)';

const isMissing = (value) => value === '' || value == null || value === 'NA';

const sourceRows = readRows(SOURCE_CSV);
const rows = dropNulls
  ? sourceRows.filter((r) => DIMENSIONS.every((d) => !isMissing(r[d])))
  : sourceRows.map((r) => ({
      ...r,
      // An explicit label, not an empty cell: empty already means "not part
      // of this marginal". Labelling keeps these penguins countable, so the
      // cube's totals reconcile with the source table.
      ...Object.fromEntries(
        DIMENSIONS.map((d) => [d, isMissing(r[d]) ? NULL_LABEL : r[d]]),
      ),
    }));

const cubeRows = [];
for (const subset of powerset(DIMENSIONS)) {
  /** @type {Map<string, {key: Record<string,string>, n: number, massTotal: number, massCount: number}>} */
  const cells = new Map();
  for (const row of rows) {
    const key = Object.fromEntries(subset.map((d) => [d, row[d]]));
    const id = subset.map((d) => row[d]).join('¶');
    const cell = cells.get(id) ?? { key, n: 0, massTotal: 0, massCount: 0 };
    cell.n += 1;
    // Two penguins have no recorded body mass. A mean ignores them rather
    // than counting them as zero, so its denominator can differ from `cnt`
    // — which is one more reason it cannot be re-aggregated from cells.
    const mass = Number(row.body_mass_g);
    if (Number.isFinite(mass)) {
      cell.massTotal += mass;
      cell.massCount += 1;
    }
    cells.set(id, cell);
  }
  for (const cell of cells.values()) {
    cubeRows.push({
      ...Object.fromEntries(DIMENSIONS.map((d) => [d, cell.key[d] ?? ''])),
      [MEASURE]: cell.n,
      [MEAN_MEASURE]:
        cell.massCount > 0 ? Math.round(cell.massTotal / cell.massCount) : '',
    });
  }
}

const columns = [...DIMENSIONS, MEASURE, MEAN_MEASURE];
const csv = [
  columns.join(','),
  ...cubeRows.map((r) => columns.map((c) => r[c]).join(',')),
].join('\n');

const cardinality = (field) => new Set(rows.map((r) => r[field])).size;
const measureCardinality = (field) =>
  new Set(cubeRows.map((r) => r[field])).size;

const datapackage = {
  name: 'penguins_cube',
  // Consumers resolve each resource's `path` against `udi:path`; without it
  // joinDataPath builds an undefined URL and CSV domain loading is skipped.
  'udi:name': 'penguins_cube',
  'udi:path': './data/penguins_cube/',
  resources: [
    {
      name: 'penguin_counts',
      type: 'table',
      path: 'penguins_cube.csv',
      scheme: 'file',
      format: 'csv',
      mediatype: 'text/csv',
      encoding: 'utf-8',
      'udi:row_count': cubeRows.length,
      'udi:column_count': columns.length,
      // Resource-level cube metadata. `udi:cube` marks the resource as
      // pre-aggregated; the dimension/measure lists drive marginal selection
      // (the `only` transformation) and expand/filter/contract.
      'udi:cube': true,
      'udi:dimensions': DIMENSIONS,
      'udi:measures': [MEASURE, MEAN_MEASURE],
      // How each measure re-aggregates when a marginal is contracted.
      // Omitting a measure here means "assume additive"; `mean` is called out
      // explicitly so consumers refuse to contract it rather than averaging
      // averages.
      'udi:measure_aggregations': { [MEASURE]: 'sum', [MEAN_MEASURE]: 'mean' },
      schema: {
        fields: [
          ...DIMENSIONS.map((name) => ({
            name,
            type: 'string',
            description: `Cube dimension: ${name} (null in marginals that do not include it).`,
            'udi:cardinality': cardinality(name),
            'udi:unique': false,
            'udi:data_type': 'nominal',
          })),
          {
            name: MEASURE,
            type: 'integer',
            description: 'Number of penguins in this cell.',
            'udi:cardinality': measureCardinality(MEASURE),
            'udi:unique': false,
            'udi:data_type': 'quantitative',
          },
          {
            name: MEAN_MEASURE,
            type: 'integer',
            description:
              'Mean body mass (g) in this cell. Non-additive: cannot be re-aggregated across a contracted dimension.',
            'udi:cardinality': measureCardinality(MEAN_MEASURE),
            'udi:unique': false,
            'udi:data_type': 'quantitative',
          },
        ],
      },
    },
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'penguins_cube.csv'), csv + '\n');
writeFileSync(
  join(OUT_DIR, 'datapackage.json'),
  JSON.stringify(datapackage, null, 2) + '\n',
);

console.log(
  `penguins_cube: ${cubeRows.length} rows from ${rows.length} penguins -> ${OUT_DIR}`,
);
