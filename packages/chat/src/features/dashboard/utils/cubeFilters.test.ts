import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { from } from 'arquero';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from 'udi-toolkit';
import type { UDIGrammar, DataTransformation } from 'udi-toolkit';
import type { CubeInfo } from '@/types/dataPackage';
import type { ContractOp } from '@/features/data-package';
import {
  buildCubeTransformation,
  buildCubeCountTransformation,
  collectFieldReferences,
  getRepresentedFields,
  marginalDimensions,
  type ActiveFilter,
} from './cubeFilters';

// The committed penguins cube (scripts/gen-penguins-cube.mjs): one row per
// subset of {species, island, sex}, `cnt` additive, `mean_body_mass_g` not.
const CUBE: CubeInfo = {
  dimensions: ['species', 'island', 'sex'],
  measures: ['cnt', 'mean_body_mass_g'],
};

const SOURCE = 'penguin_counts';

/** Contract ops as dataPackageStore.getCubeMeasureOp would report them. */
const measureOp = (measure: string): ContractOp | null => (measure === 'cnt' ? 'sum' : null);

/** The marginal selector the agent's <MARGINAL:…> emits, for dimensions D. */
function marginalFilter(active: string[]): DataTransformation {
  const clauses = CUBE.dimensions.map((d) => ({
    op: active.includes(d) ? '!=' : '==',
    left: { field: d },
    right: { literal: null },
  }));
  let expr: unknown = clauses[0];
  for (const clause of clauses.slice(1)) {
    expr = { op: '&&', left: expr, right: clause };
  }
  return { filter: expr } as DataTransformation;
}

/** A counts-by-<dims> bar chart over the cube, as a cube template produces. */
function barSpec(dims: string[]): UDIGrammar {
  return {
    source: { name: SOURCE, source: './penguins_cube.csv' },
    transformation: [marginalFilter(dims)],
    representation: {
      mark: 'bar',
      mapping: [
        ...dims.map((d, i) => ({
          encoding: i === 0 ? 'x' : 'color',
          field: d,
          type: 'nominal',
        })),
        { encoding: 'y', field: 'cnt', type: 'quantitative' },
      ],
    },
  } as unknown as UDIGrammar;
}

const filter = (id: string, fields: string[], sourceName = SOURCE): ActiveFilter => ({
  id,
  sourceName,
  fields,
});

const build = (spec: UDIGrammar, filters: ActiveFilter[], nullFilters: DataTransformation[] = []) =>
  buildCubeTransformation({
    spec,
    cube: CUBE,
    sourceName: SOURCE,
    filters,
    measureOp,
    nullFilters,
  });

describe('getRepresentedFields', () => {
  it('collects fields from a single representation', () => {
    expect(getRepresentedFields(barSpec(['species'])).sort()).toEqual(['cnt', 'species']);
  });

  it('collects fields across layered representations', () => {
    const spec = {
      representation: [
        { mark: 'bar', mapping: [{ encoding: 'x', field: 'a' }] },
        { mark: 'line', mapping: { encoding: 'y', field: 'b' } },
      ],
    } as unknown as UDIGrammar;
    expect(getRepresentedFields(spec).sort()).toEqual(['a', 'b']);
  });

  it('returns an empty list for a spec with no representation', () => {
    expect(getRepresentedFields({ source: { name: 'x', source: 'x' } })).toEqual([]);
  });
});

describe('collectFieldReferences', () => {
  it('finds measures referenced only inside the pipeline, not the encodings', () => {
    // A normalized stacked bar maps `proportion`; the cube measure it derives
    // from appears solely in the rollups.
    const spec = {
      transformation: [
        { groupby: 'species', out: 'totals' },
        { rollup: { axis_total: { op: 'sum', field: 'cnt' } } },
      ],
      representation: { mark: 'bar', mapping: [{ encoding: 'y', field: 'proportion' }] },
    } as unknown as UDIGrammar;
    const refs = collectFieldReferences(spec);
    expect(refs.has('cnt')).toBe(true);
    expect(refs.has('species')).toBe(true);
    expect(refs.has('proportion')).toBe(true);
  });
});

describe('marginalDimensions', () => {
  it('reads the active set out of a null-comparison conjunction', () => {
    expect(marginalDimensions(marginalFilter(['species']), CUBE.dimensions)).toEqual(['species']);
    expect(marginalDimensions(marginalFilter([]), CUBE.dimensions)).toEqual([]);
  });

  it('reads the active set out of an `only` transformation', () => {
    expect(
      marginalDimensions({ only: ['species', 'island'] } as DataTransformation, CUBE.dimensions),
    ).toEqual(['species', 'island']);
  });

  it('rejects an ordinary predicate', () => {
    const notMarginal = {
      filter: { op: '==', left: { field: 'species' }, right: { literal: 'Adelie' } },
    } as DataTransformation;
    expect(marginalDimensions(notMarginal, CUBE.dimensions)).toBeNull();
  });
});

describe('buildCubeTransformation — degenerate cases', () => {
  it('leaves the pipeline untouched when there are no filters', () => {
    const spec = barSpec(['species']);
    const { transformation, skipped } = build(spec, []);
    expect(transformation).toEqual(spec.transformation);
    expect(skipped).toEqual([]);
  });

  it('prepends filters without expanding when every filtered field is already represented', () => {
    const spec = barSpec(['species']);
    const { transformation, skipped } = build(spec, [filter('f1', ['species'])]);
    expect(transformation).toEqual([{ filter: { name: 'f1' } }, ...spec.transformation!]);
    expect(skipped).toEqual([]);
    // No expand and no contract: the marginal already has `species` populated.
    expect(transformation.some((t) => 'only' in t)).toBe(false);
    expect(transformation.some((t) => 'rollup' in t)).toBe(false);
  });

  it('contracts to a single row for a grand-total view', () => {
    const spec = {
      source: { name: SOURCE, source: './penguins_cube.csv' },
      transformation: [marginalFilter([])],
      representation: { mark: 'text', mapping: [{ encoding: 'text', field: 'cnt' }] },
    } as unknown as UDIGrammar;
    const { transformation } = build(spec, [filter('f1', ['island'])]);
    expect(transformation).toEqual([
      { only: ['island'] },
      { filter: { name: 'f1' } },
      { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
    ]);
    // V is empty, so there is nothing to group by.
    expect(transformation.some((t) => 'groupby' in t)).toBe(false);
  });

  it('appends null-value filters last, as the row-level path does', () => {
    const nullFilters = [
      { filter: { op: '!=', left: { field: 'species' }, right: { literal: null } } },
    ] as DataTransformation[];
    const { transformation } = build(barSpec(['species']), [filter('f1', ['island'])], nullFilters);
    expect(transformation[transformation.length - 1]).toEqual(nullFilters[0]);
  });
});

describe('buildCubeTransformation — expand/filter/contract', () => {
  it('expands to the joint marginal, filters, then rolls back up', () => {
    const { transformation, skipped } = build(barSpec(['species']), [filter('f1', ['island'])]);
    expect(transformation).toEqual([
      { only: ['species', 'island'] },
      { filter: { name: 'f1' } },
      { groupby: ['species'] },
      { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
    ]);
    expect(skipped).toEqual([]);
  });

  it('orders the expanded dimensions as the cube declares them', () => {
    const { transformation } = build(barSpec(['sex']), [filter('f1', ['island'])]);
    expect((transformation[0] as { only: string[] }).only).toEqual(['island', 'sex']);
  });

  it('unions multiple filtered dimensions into one expansion', () => {
    const { transformation } = build(barSpec(['species']), [
      filter('f1', ['island']),
      filter('f2', ['sex']),
    ]);
    expect(transformation[0]).toEqual({ only: ['species', 'island', 'sex'] });
    expect(transformation.slice(1, 3)).toEqual([
      { filter: { name: 'f1' } },
      { filter: { name: 'f2' } },
    ]);
  });

  it('keeps the spec pipeline that follows the marginal selector', () => {
    const spec = barSpec(['species']);
    spec.transformation!.push({ orderby: 'cnt' } as DataTransformation);
    const { transformation } = build(spec, [filter('f1', ['island'])]);
    expect(transformation[transformation.length - 1]).toEqual({ orderby: 'cnt' });
  });

  it('contracts a measure referenced only by a downstream rollup', () => {
    // The normalized stacked-bar cube template: no raw measure is encoded.
    const spec = {
      source: { name: SOURCE, source: './penguins_cube.csv' },
      transformation: [
        marginalFilter(['species', 'sex']),
        { groupby: 'species', out: 'groupTotals' },
        { rollup: { axis_total: { op: 'sum', field: 'cnt' } } },
      ],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'species', type: 'nominal' },
          { encoding: 'y', field: 'proportion', type: 'quantitative' },
          { encoding: 'color', field: 'sex', type: 'nominal' },
        ],
      },
    } as unknown as UDIGrammar;
    const { transformation, skipped } = build(spec, [filter('f1', ['island'])]);
    expect(skipped).toEqual([]);
    expect(transformation[0]).toEqual({ only: ['species', 'island', 'sex'] });
    expect(transformation[2]).toEqual({ groupby: ['species', 'sex'] });
    expect(transformation[3]).toEqual({ rollup: { cnt: { op: 'sum', field: 'cnt' } } });
    // ...and the spec's own steps still follow, reading a `cnt` column that
    // contraction has put back.
    expect(transformation[4]).toEqual({ groupby: 'species', out: 'groupTotals' });
  });

  it('includes a marginal dimension the spec declares but does not encode', () => {
    const spec = barSpec(['species']);
    // Declared marginal is species x sex; only species is encoded.
    spec.transformation = [marginalFilter(['species', 'sex'])];
    const { transformation } = build(spec, [filter('f1', ['island'])]);
    expect(transformation[0]).toEqual({ only: ['species', 'island', 'sex'] });
    expect(transformation[2]).toEqual({ groupby: ['species', 'sex'] });
  });
});

describe('buildCubeTransformation — filters a cube cannot serve', () => {
  it('skips a filter on a field that is not a cube dimension', () => {
    const { transformation, skipped } = build(barSpec(['species']), [
      filter('f1', ['bill_length_mm']),
    ]);
    expect(skipped).toEqual([{ id: 'f1', fields: ['bill_length_mm'], reason: 'non-dimension' }]);
    expect(transformation).toEqual(barSpec(['species']).transformation);
  });

  it('skips a cross-source filter — a cube has no keys to join on', () => {
    const { transformation, skipped } = build(barSpec(['species']), [
      filter('f1', ['island'], 'some_other_entity'),
    ]);
    expect(skipped).toEqual([{ id: 'f1', fields: ['island'], reason: 'cross-source' }]);
    expect(transformation).toEqual(barSpec(['species']).transformation);
  });

  it('refuses to contract a non-additive measure', () => {
    const spec = {
      source: { name: SOURCE, source: './penguins_cube.csv' },
      transformation: [marginalFilter(['species'])],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'species', type: 'nominal' },
          { encoding: 'y', field: 'mean_body_mass_g', type: 'quantitative' },
        ],
      },
    } as unknown as UDIGrammar;
    const { transformation, skipped } = build(spec, [filter('f1', ['island'])]);
    expect(skipped).toEqual([{ id: 'f1', fields: ['island'], reason: 'non-additive-measure' }]);
    // The chart keeps its own unfiltered marginal rather than showing a
    // plausible wrong average.
    expect(transformation).toEqual(spec.transformation);
  });

  it('still applies the filters that need no expansion when one is refused', () => {
    const spec = {
      source: { name: SOURCE, source: './penguins_cube.csv' },
      transformation: [marginalFilter(['species'])],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'species', type: 'nominal' },
          { encoding: 'y', field: 'mean_body_mass_g', type: 'quantitative' },
        ],
      },
    } as unknown as UDIGrammar;
    const { transformation, skipped } = build(spec, [
      filter('keep', ['species']),
      filter('drop', ['island']),
    ]);
    expect(skipped.map((s) => s.id)).toEqual(['drop']);
    expect(transformation[0]).toEqual({ filter: { name: 'keep' } });
  });

  it('leaves a spec with no recognisable marginal selector alone', () => {
    const spec = {
      source: { name: SOURCE, source: './penguins_cube.csv' },
      transformation: [{ orderby: 'cnt' }],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'species', type: 'nominal' },
          { encoding: 'y', field: 'cnt', type: 'quantitative' },
        ],
      },
    } as unknown as UDIGrammar;
    const { transformation, skipped } = build(spec, [filter('f1', ['island'])]);
    expect(skipped).toEqual([{ id: 'f1', fields: ['island'], reason: 'no-marginal' }]);
    expect(transformation).toEqual(spec.transformation);
  });
});

describe('buildCubeTransformation — reversibility', () => {
  it('returns the original spec pipeline once every filter is cleared', () => {
    const spec = barSpec(['species']);
    const original = JSON.parse(JSON.stringify(spec.transformation));
    build(spec, [filter('f1', ['island'])]);
    build(spec, [filter('f1', ['island']), filter('f2', ['sex'])]);
    const { transformation } = build(spec, []);
    expect(transformation).toEqual(original);
  });
});

describe('buildCubeCountTransformation', () => {
  it('reads the grand total when nothing is filtered', () => {
    const { transformation } = buildCubeCountTransformation({
      cube: CUBE,
      sourceName: SOURCE,
      filters: [],
      measureOp,
      as: 'count',
    });
    expect(transformation).toEqual([
      { only: [] },
      { rollup: { count: { op: 'sum', field: 'cnt' } } },
    ]);
  });

  it('expands to the filtered dimensions and contracts to one row', () => {
    const { transformation } = buildCubeCountTransformation({
      cube: CUBE,
      sourceName: SOURCE,
      filters: [filter('f1', ['island'])],
      measureOp,
      as: 'count',
    });
    expect(transformation).toEqual([
      { only: ['island'] },
      { filter: { name: 'f1' } },
      { rollup: { count: { op: 'sum', field: 'cnt' } } },
    ]);
  });

  it('reports cross-source and non-dimension filters as skipped', () => {
    const { skipped } = buildCubeCountTransformation({
      cube: CUBE,
      sourceName: SOURCE,
      filters: [filter('a', ['island'], 'elsewhere'), filter('b', ['bill_length_mm'])],
      measureOp,
      as: 'count',
    });
    expect(skipped.map((s) => s.reason).sort()).toEqual(['cross-source', 'non-dimension']);
  });
});

// ── Numeric verification against the real Arquero executor ───────────────────
//
// The composition tests above assert the SHAPE of the pipeline. This block
// runs it, so a pipeline that is well-formed but semantically wrong still
// fails. It is the spec's worked reference case, with penguins standing in
// for donors: counts by species (a bar chart) with an island filter must
// expand to the species x island marginal, drop the excluded islands, and
// roll back up to per-species counts.

// Resolved from the package root (vitest's cwd) rather than import.meta.url,
// which vite serves over http during a test run.
const CUBE_CSV = resolve(process.cwd(), '../../sample-data/penguins_cube/penguins_cube.csv');

type CubeRow = Record<string, string | number | null>;

function readCubeRows(): CubeRow[] {
  const lines = readFileSync(CUBE_CSV, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: CubeRow = {};
    header.forEach((name, i) => {
      const raw = cells[i] ?? '';
      // An empty dimension cell means "this dimension does not participate in
      // this marginal" — null, not the empty string.
      row[name] = raw === '' ? null : CUBE.measures.includes(name) ? Number(raw) : raw;
    });
    return row;
  });
}

describe('the committed penguins_cube data package', () => {
  const descriptor = JSON.parse(
    readFileSync(
      resolve(process.cwd(), '../../sample-data/penguins_cube/datapackage.json'),
      'utf8',
    ),
  );

  it('declares udi:path, which every resource URL is resolved against', () => {
    // Omitting it half-loads the package and then throws from inside a render
    // ("Cannot read properties of undefined (reading 'endsWith')"), and CSV
    // domain loading is skipped outright.
    expect(typeof descriptor['udi:path']).toBe('string');
    expect(descriptor['udi:path']).not.toBe('');
  });

  it('declares the cube roles the dashboard reads off the resource', () => {
    const resource = descriptor.resources[0];
    expect(resource['udi:cube']).toBe(true);
    expect(resource['udi:dimensions']).toEqual(CUBE.dimensions);
    expect(resource['udi:measures']).toEqual(CUBE.measures);
    // The non-additive measure must stay declared — it is what the
    // refuse-to-contract path is exercised against.
    expect(resource['udi:measure_aggregations']).toMatchObject({ mean_body_mass_g: 'mean' });
  });

  it('matches the CSV it describes', () => {
    expect(descriptor.resources[0]['udi:row_count']).toBe(readCubeRows().length);
  });
});

describe('expand/filter/contract against the penguins cube', () => {
  let rows: CubeRow[];
  let store: ReturnType<typeof useDataSourcesStore>;

  beforeAll(() => {
    rows = readCubeRows();
    setActivePinia(createPinia());
    store = useDataSourcesStore();
    store.seedDataSource(SOURCE, CUBE_CSV, from(rows));
    store.setCubeMetadata(SOURCE, CUBE);
  });

  const run = (transformation: DataTransformation[]) =>
    store.getDataObject([SOURCE], transformation, { displayDataOnly: true })?.displayData as Array<
      Record<string, number | string>
    >;

  /** Cells of a marginal, as stored in the cube. */
  const marginal = (dims: string[]) =>
    rows.filter((r) =>
      CUBE.dimensions.every((d) => (dims.includes(d) ? r[d] !== null : r[d] === null)),
    );

  it('the unfiltered chart still reads the stored species marginal', () => {
    const { transformation } = build(barSpec(['species']), []);
    const result = run(transformation);
    const expected = marginal(['species']).map((r) => ({ species: r.species, cnt: r.cnt }));
    expect(result.map((r) => ({ species: r.species, cnt: r.cnt })).sort(bySpecies)).toEqual(
      expected.sort(bySpecies),
    );
  });

  it('the filtered chart equals the sum of the matching species x island cells', () => {
    const islands = ['Biscoe'];
    store.watchDataSelection(SOURCE, 'island-filter', 'point');
    store.updateDataSelection('island-filter', { island: islands });

    const { transformation } = build(barSpec(['species']), [
      { id: 'island-filter', sourceName: SOURCE, fields: ['island'] },
    ]);
    const result = run(transformation);

    // Independently: sum the joint cells for the selected islands.
    const expected = new Map<string, number>();
    for (const cell of marginal(['species', 'island'])) {
      if (!islands.includes(cell.island as string)) continue;
      const key = cell.species as string;
      expected.set(key, (expected.get(key) ?? 0) + (cell.cnt as number));
    }

    expect(result.length).toBe(expected.size);
    for (const row of result) {
      expect(row.cnt).toBe(expected.get(row.species as string));
    }
    // And it is genuinely narrower than the unfiltered chart.
    const total = result.reduce((a, r) => a + (r.cnt as number), 0);
    expect(total).toBeLessThan(marginal(['species']).reduce((a, r) => a + (r.cnt as number), 0));
  });

  it('selecting every island reproduces the unfiltered species marginal', () => {
    const allIslands = [...new Set(marginal(['island']).map((r) => r.island as string))];
    store.watchDataSelection(SOURCE, 'all-islands', 'point');
    store.updateDataSelection('all-islands', { island: allIslands });

    const { transformation } = build(barSpec(['species']), [
      { id: 'all-islands', sourceName: SOURCE, fields: ['island'] },
    ]);
    const result = run(transformation);
    const expected = new Map(
      marginal(['species']).map((r) => [r.species as string, r.cnt as number]),
    );
    expect(result.length).toBe(expected.size);
    for (const row of result) {
      expect(row.cnt).toBe(expected.get(row.species as string));
    }
  });

  it('the grand-total count contracts to a single row', () => {
    const { transformation } = buildCubeCountTransformation({
      cube: CUBE,
      sourceName: SOURCE,
      filters: [],
      measureOp,
      as: 'count',
    });
    const result = run(transformation);
    expect(result).toEqual([{ count: marginal([])[0].cnt }]);
  });
});

function bySpecies(a: { species: unknown }, b: { species: unknown }): number {
  return String(a.species).localeCompare(String(b.species));
}
