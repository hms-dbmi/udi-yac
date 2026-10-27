import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { from } from 'arquero';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from 'udi-toolkit';
import type { DataTransformation, UDIGrammar } from 'udi-toolkit';
import type {
  DataPackage,
  DimensionLink,
  LinkedColumn,
  LinkGroup,
  LinkMember,
} from '@/types/dataPackage';
import { computeDimensionLinks, createDataPackageStore } from '@/features/data-package';
import { createDashboardStore } from '../stores/dashboardStore';
import { createDataFiltersStore, type DataSelections } from '../stores/dataFiltersStore';
import { chartCoversFilter, composeChartSelection } from './chartSelection';
import {
  canonicalColumn,
  canonicalFilter,
  isLinkedSelectionKey,
  linkedEntitiesByColumn,
  linkedSelectionKey,
  linkedSelections,
  translateValues,
  withLinkedSelections,
} from './linkedSelections';

const TS: LinkedColumn = { entity: 'Treatment Summary', field: 'initial_treatment_order' };
const EFS: LinkMember = { entity: 'Efs', field: 'initial_treatment_order', toHub: {} };
const OS: LinkMember = { entity: 'Os', field: 'initial_treatment_order', toHub: {} };
/** Two cubes linked exactly to one line-level column, kept there. */
const GROUP: LinkGroup = { hub: TS, members: [TS, EFS, OS], canonical: TS };

// The subtype link: a cube spells the diagnosis its own way.
const DX: LinkedColumn = { entity: 'Event', field: 'cns_integrated_diagnosis' };
const SUBTYPE: LinkMember = {
  entity: 'Efs',
  field: 'subtype',
  toHub: {
    SHH: ['MB, SHH TP53-wildtype', 'MB, SHH TP53-mutant'],
    'Group 4': ['MB, Group 4'],
  },
};
const OS_SUBTYPE: LinkMember = { ...SUBTYPE, entity: 'Os' };
const DX_GROUP: LinkGroup = { hub: DX, members: [DX, SUBTYPE, OS_SUBTYPE], canonical: DX };

const point = (entity: string, field: string, values: string[]) => ({
  dataSourceKey: entity,
  type: 'point' as const,
  selection: { [field]: values },
});

describe('linkedSelections', () => {
  it('mirrors a selection onto every other column of its group', () => {
    const out = linkedSelections(
      { 'col:Treatment Summary.initial_treatment_order': point(TS.entity, TS.field, ['a']) },
      [GROUP],
    );
    expect(out[linkedSelectionKey(EFS, TS)]).toEqual(point('Efs', TS.field, ['a']));
    expect(out[linkedSelectionKey(OS, TS)]).toEqual(point('Os', TS.field, ['a']));
  });

  it('re-keys the mirror to the target column name', () => {
    const cube: LinkMember = { entity: 'Efs', field: 'order', toHub: {} };
    const out = linkedSelections({ x: point(TS.entity, TS.field, ['a']) }, [
      { hub: TS, members: [TS, cube], canonical: TS },
    ]);
    expect(out[linkedSelectionKey(cube, TS)]?.selection).toEqual({ order: ['a'] });
  });

  it('translates values through the value map, both ways', () => {
    const fromLine = linkedSelections({ x: point(DX.entity, DX.field, ['MB, SHH TP53-mutant']) }, [
      DX_GROUP,
    ]);
    expect(fromLine[linkedSelectionKey(SUBTYPE, DX)]?.selection).toEqual({ subtype: ['SHH'] });

    const fromCube = linkedSelections({ x: point('Efs', 'subtype', ['SHH']) }, [DX_GROUP]);
    expect(fromCube[linkedSelectionKey(DX, SUBTYPE)]?.selection).toEqual({
      cns_integrated_diagnosis: ['MB, SHH TP53-wildtype', 'MB, SHH TP53-mutant'],
    });
    // Cube to cube, through the hub.
    expect(fromCube[linkedSelectionKey(OS_SUBTYPE, SUBTYPE)]?.selection).toEqual({
      subtype: ['SHH'],
    });
  });

  it('emits every pair, null when the source is unfiltered, so a cleared filter is cleared', () => {
    const out = linkedSelections({}, [GROUP]);
    // 3 columns -> 6 ordered pairs, all present and all null.
    expect(Object.keys(out)).toHaveLength(6);
    expect(Object.values(out).every((s) => s.selection === null)).toBe(true);
  });

  it('treats an empty point list as no constraint', () => {
    const out = linkedSelections({ x: point(TS.entity, TS.field, []) }, [GROUP]);
    expect(out[linkedSelectionKey(EFS, TS)]?.selection).toBeNull();
  });

  it('intersects several filters on the same column', () => {
    const out = linkedSelections(
      {
        x: point(TS.entity, TS.field, ['a', 'b']),
        y: point(TS.entity, TS.field, ['b', 'c']),
      },
      [GROUP],
    );
    expect(out[linkedSelectionKey(EFS, TS)]?.selection).toEqual({ [TS.field]: ['b'] });
  });

  it('intersects interval filters, carrying the range across unmapped', () => {
    const range = (lo: number, hi: number) => ({
      dataSourceKey: 'L',
      type: 'interval' as const,
      selection: { n: [lo, hi] as [number, number] },
    });
    const L = { entity: 'L', field: 'n' };
    const C = { entity: 'C', field: 'n', toHub: {} };
    const out = linkedSelections({ x: range(0, 10), y: range(5, 20) }, [
      { hub: L, members: [L, C], canonical: L },
    ]);
    expect(out[linkedSelectionKey(C, L)]).toMatchObject({
      type: 'interval',
      selection: { n: [5, 10] },
    });
  });

  it('never mirrors a mirror', () => {
    const mirrored: DataSelections = {
      [linkedSelectionKey(EFS, TS)]: point('Efs', TS.field, ['a']),
    };
    const out = linkedSelections(mirrored, [GROUP]);
    expect(out[linkedSelectionKey(OS, EFS)]?.selection).toBeNull();
  });

  it('withLinkedSelections passes selections through when there are no links', () => {
    const selections = { x: point('A', 'f', ['a']) };
    expect(withLinkedSelections(selections, [])).toBe(selections);
  });

  it('names mirrors so they cannot be mistaken for a filter someone set', () => {
    expect(isLinkedSelectionKey(linkedSelectionKey(EFS, TS))).toBe(true);
    expect(isLinkedSelectionKey('col:Efs.initial_treatment_order')).toBe(false);
  });
});

describe('translateValues', () => {
  it('carries a value with no entry across as it is', () => {
    // An ATRT diagnosis has no cube subtype: it reaches the cube as itself,
    // where it matches nothing.
    expect(translateValues(DX, SUBTYPE, ['ATRT, NOS'])).toEqual(['ATRT, NOS']);
    expect(translateValues(SUBTYPE, DX, ['WNT'])).toEqual(['WNT']);
  });

  it('collapses several line-level values onto the one cube value they share', () => {
    expect(
      translateValues(DX, SUBTYPE, ['MB, SHH TP53-wildtype', 'MB, SHH TP53-mutant', 'MB, Group 4']),
    ).toEqual(['SHH', 'Group 4']);
  });
});

describe('canonicalFilter', () => {
  it('moves a filter on a cube dimension to the line-level column, translated', () => {
    expect(canonicalFilter([DX_GROUP], 'Efs', 'subtype', 'point', ['SHH'])).toEqual({
      entity: 'Event',
      field: 'cns_integrated_diagnosis',
      values: ['MB, SHH TP53-wildtype', 'MB, SHH TP53-mutant'],
    });
  });

  it('keeps a filter already on the canonical column, or on an unlinked one', () => {
    const onHub = canonicalFilter([DX_GROUP], DX.entity, DX.field, 'point', ['x']);
    expect(onHub).toEqual({ ...DX, values: ['x'] });
    expect(canonicalFilter([DX_GROUP], 'Efs', 'site', 'point', ['x'])).toEqual({
      entity: 'Efs',
      field: 'site',
      values: ['x'],
    });
  });

  it('moves a line-level filter to the cube when the cube side is canonical', () => {
    const cubeCanonical = { ...DX_GROUP, canonical: SUBTYPE };
    expect(canonicalFilter([cubeCanonical], DX.entity, DX.field, 'point', ['MB, Group 4'])).toEqual(
      { entity: 'Efs', field: 'subtype', values: ['Group 4'] },
    );
    expect(canonicalColumn([cubeCanonical], 'Os', 'subtype')).toEqual(SUBTYPE);
  });
});

describe('linkedEntitiesByColumn', () => {
  it('maps each column to the other tables of its group', () => {
    const map = linkedEntitiesByColumn([GROUP]);
    expect(map.get('Treatment Summary.initial_treatment_order')).toEqual(['Efs', 'Os']);
    expect(map.get('Efs.initial_treatment_order')).toEqual(['Treatment Summary', 'Os']);
  });
});

describe('a chart on a linked column', () => {
  const select = { entity: 'Efs', type: 'point' as const, fields: ['subtype'] };

  it('shows a filter kept on the canonical column as its own selection', () => {
    const selections = withLinkedSelections(
      { 'col:Event.cns_integrated_diagnosis': point(DX.entity, DX.field, ['MB, Group 4']) },
      [DX_GROUP],
    );
    expect(composeChartSelection(select, selections).selection).toEqual({
      subtype: ['Group 4'],
    });
  });

  it('lights up when that filter is hovered', () => {
    expect(chartCoversFilter(select, 'col:Event.cns_integrated_diagnosis', [DX_GROUP])).toBe(true);
    expect(chartCoversFilter(select, 'col:Event.cns_integrated_diagnosis')).toBe(false);
  });
});

// ── Declaring links in a data package ────────────────────────────────────────

const field = (name: string) => ({ name, 'udi:data_type': 'nominal' as const });

function mixedPackage(links: Record<string, Record<string, DimensionLink>>): DataPackage {
  const cube = (name: string) => ({
    name,
    path: `${name}.csv`,
    'udi:cube': true,
    'udi:dimensions': ['initial_treatment_order', 'subtype'],
    'udi:measures': ['cnt'],
    'udi:linked_dimensions': links[name],
    schema: { fields: [field('initial_treatment_order'), field('subtype'), field('cnt')] },
  });
  return {
    'udi:path': './',
    resources: [
      {
        name: 'Treatment Summary',
        path: 'ts.csv',
        schema: { fields: [field('research_id'), field('initial_treatment_order')] },
      },
      cube('Efs'),
      cube('Os'),
    ],
  } as unknown as DataPackage;
}

describe('computeDimensionLinks', () => {
  it('joins two cubes linked to the same line-level column into one group', () => {
    const groups = computeDimensionLinks(
      mixedPackage({
        Efs: { initial_treatment_order: TS },
        Os: { initial_treatment_order: TS },
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].hub).toEqual(TS);
    expect(groups[0].members.map(({ entity, field }) => ({ entity, field }))).toEqual([
      TS,
      { entity: 'Efs', field: TS.field },
      { entity: 'Os', field: TS.field },
    ]);
    // The line-level column by default.
    expect(groups[0].canonical).toEqual(TS);
  });

  it('carries the value map, and a cube side asked to be canonical', () => {
    const values = { a: ['A1', 'A2'] };
    const [group] = computeDimensionLinks(
      mixedPackage({ Efs: { initial_treatment_order: { ...TS, values, canonical: 'dimension' } } }),
    );
    expect(group.members[1].toHub).toEqual(values);
    expect(group.canonical).toMatchObject({ entity: 'Efs', field: TS.field });
  });

  it('drops a link to a column the package does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const groups = computeDimensionLinks(
      mixedPackage({ Efs: { initial_treatment_order: { entity: 'Nope', field: 'x' } } }),
    );
    expect(groups).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops a link from a column that is not a cube dimension', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const groups = computeDimensionLinks(mixedPackage({ Efs: { cnt: TS } }));
    expect(groups).toEqual([]);
    warn.mockRestore();
  });
});

// ── End to end: a line-level filter changes a cube chart, and back ───────────
//
// The committed penguins cube stands in for a cube, and a small line-level
// `penguins` table for its line-level data; `island` is linked between them.

const CUBE = 'penguin_counts';
const LINE = 'penguins';
const CUBE_CSV = resolve(process.cwd(), '../../sample-data/penguins_cube/penguins_cube.csv');
const DIMENSIONS = ['species', 'island', 'sex'];

type Row = Record<string, string | number | null>;

function readCubeRows(): Row[] {
  const [head, ...lines] = readFileSync(CUBE_CSV, 'utf8').trim().split('\n');
  const header = head.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(
      header.map((name, i) => {
        const raw = cells[i] ?? '';
        return [name, raw === '' ? null : DIMENSIONS.includes(name) ? raw : Number(raw)];
      }),
    );
  });
}

function setup(link: Partial<DimensionLink> = {}) {
  const dataPackage = createDataPackageStore();
  const json = {
    'udi:path': './',
    resources: [
      {
        name: LINE,
        path: 'penguins.csv',
        schema: { fields: [field('id'), field('island')] },
      },
      {
        name: CUBE,
        path: 'penguins_cube.csv',
        'udi:cube': true,
        'udi:dimensions': DIMENSIONS,
        'udi:measures': ['cnt'],
        'udi:linked_dimensions': { island: { entity: LINE, field: 'island', ...link } },
        schema: { fields: [...DIMENSIONS.map(field), field('cnt')] },
      },
    ],
  } as unknown as DataPackage;
  dataPackage.setState({
    dataPackage: json,
    dimensionLinks: computeDimensionLinks(json),
    loadingPhase: 'ready',
  });
  return { dashboard: createDashboardStore(), dataFilters: createDataFiltersStore(), dataPackage };
}

/** Counts by species, read off the species marginal — as a cube template emits. */
const speciesBars: UDIGrammar = {
  source: { name: CUBE, source: './penguins_cube.csv' },
  transformation: [{ only: ['species'] }],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'species', type: 'nominal' },
      { encoding: 'y', field: 'cnt', type: 'quantitative' },
    ],
  },
} as unknown as UDIGrammar;

const lineBars: UDIGrammar = {
  source: { name: LINE, source: './penguins.csv' },
  transformation: [{ groupby: 'island' }, { rollup: { n: { op: 'count' } } }],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'island', type: 'nominal' },
      { encoding: 'y', field: 'n', type: 'quantitative' },
    ],
  },
} as unknown as UDIGrammar;

const selectIsland = (
  dataFilters: ReturnType<typeof createDataFiltersStore>,
  entity: string,
  islands: string[],
) =>
  dataFilters
    .getState()
    .applyChartSelection(
      entity,
      ['island'],
      { dataSourceKey: entity, type: 'point', selection: { island: islands } },
      0,
    );

describe('linked filtering between a line-level table and a cube', () => {
  it('a line-level filter narrows the cube chart to the matching cells', () => {
    const { dashboard, dataFilters, dataPackage } = setup();
    dashboard.getState().setFilterAllNullValues(false);
    dashboard.getState().addActiveVisualization(0, 0, speciesBars, '', null);
    selectIsland(dataFilters, LINE, ['Biscoe']);
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const viz = dashboard.getState().activeVisualizations.get('0-0')!;
    // Served through the mirror, so not reported as a filter it could not apply.
    expect(viz.skippedFilters ?? []).toEqual([]);

    // Run the cube chart's pipeline in the real executor, with the selections
    // bound the way the dashboard binds them.
    setActivePinia(createPinia());
    const store = useDataSourcesStore();
    const rows = readCubeRows();
    store.seedDataSource(CUBE, CUBE_CSV, from(rows));
    store.setCubeMetadata(CUBE, { dimensions: DIMENSIONS, measures: ['cnt'] });
    store.bindExternalDataSelections(
      withLinkedSelections(
        dataFilters.getState().dataSelections,
        dataPackage.getState().dimensionLinks,
      ),
    );
    const result = store.getDataObject(
      [CUBE],
      viz.interactiveSpec.transformation as DataTransformation[],
      { displayDataOnly: true },
    )?.displayData as Row[];

    const expected = new Map<string, number>();
    for (const r of rows) {
      if (r.species === null || r.island !== 'Biscoe' || r.sex !== null) continue;
      expected.set(r.species as string, (expected.get(r.species as string) ?? 0) + Number(r.cnt));
    }
    expect(result.length).toBe(expected.size);
    for (const r of result) expect(r.cnt).toBe(expected.get(r.species as string));
  });

  it('a cube filter reaches the line-level table as a filter on its linked column', () => {
    const { dashboard, dataFilters, dataPackage } = setup();
    dashboard.getState().setFilterAllNullValues(false);
    dashboard.getState().addActiveVisualization(0, 0, lineBars, '', null);
    selectIsland(dataFilters, CUBE, ['Dream']);
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const transformation = dashboard.getState().activeVisualizations.get('0-0')!.interactiveSpec
      .transformation as Array<{ filter?: { name?: string } }>;
    const mirror = linkedSelectionKey(
      { entity: LINE, field: 'island' },
      { entity: CUBE, field: 'island' },
    );
    expect(transformation.map((t) => t.filter?.name)).toContain(mirror);
  });

  it('a line-level filter on an unlinked column is still reported as skipped', () => {
    const { dashboard, dataFilters, dataPackage } = setup();
    dashboard.getState().addActiveVisualization(0, 0, speciesBars, '', null);
    dataFilters
      .getState()
      .applyChartSelection(
        LINE,
        ['id'],
        { dataSourceKey: LINE, type: 'point', selection: { id: ['7'] } },
        0,
      );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);
    warn.mockRestore();
    const viz = dashboard.getState().activeVisualizations.get('0-0')!;
    expect(viz.skippedFilters).toEqual([
      { id: `col:${LINE}.id`, fields: ['id'], reason: 'cross-source' },
    ]);
  });

  // The line-level table spells islands its own way; a value map links them.
  const ISLAND_NAMES = {
    Biscoe: ['Biscoe Island'],
    Dream: ['Dream Island'],
    Torgersen: ['Torgersen Island'],
  };

  /** The cube chart's rows, run in the real executor as the dashboard binds them. */
  function cubeChartRows(
    store: ReturnType<typeof useDataSourcesStore>,
    viz: { interactiveSpec: UDIGrammar },
    dataFilters: ReturnType<typeof createDataFiltersStore>,
    dataPackage: ReturnType<typeof createDataPackageStore>,
  ) {
    store.seedDataSource(CUBE, CUBE_CSV, from(readCubeRows()));
    store.setCubeMetadata(CUBE, { dimensions: DIMENSIONS, measures: ['cnt'] });
    store.bindExternalDataSelections(
      withLinkedSelections(
        dataFilters.getState().dataSelections,
        dataPackage.getState().dimensionLinks,
      ),
    );
    return store.getDataObject([CUBE], viz.interactiveSpec.transformation as DataTransformation[], {
      displayDataOnly: true,
    })?.displayData as Row[];
  }

  it('a click on a cube chart is kept on the line-level column, translated', () => {
    const { dashboard, dataFilters, dataPackage } = setup({ values: ISLAND_NAMES });
    dashboard.getState().setFilterAllNullValues(false);
    dashboard.getState().addActiveVisualization(0, 0, speciesBars, '', null);
    dataFilters
      .getState()
      .applyChartSelection(
        CUBE,
        ['island'],
        { dataSourceKey: CUBE, type: 'point', selection: { island: ['Biscoe'] } },
        0,
        dataPackage.getState().dimensionLinks,
      );

    // Stored, and so shown, as the line-level filter.
    const stored = dataFilters.getState().dataSelections;
    expect(Object.keys(stored)).toEqual([`col:${LINE}.island`]);
    expect(stored[`col:${LINE}.island`].selection).toEqual({ island: ['Biscoe Island'] });

    // The cube chart still filters by the cube's own spelling.
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);
    const viz = dashboard.getState().activeVisualizations.get('0-0')!;
    setActivePinia(createPinia());
    const result = cubeChartRows(useDataSourcesStore(), viz, dataFilters, dataPackage);
    const rows = readCubeRows();
    const expected = new Map<string, number>();
    for (const r of rows) {
      if (r.species === null || r.island !== 'Biscoe' || r.sex !== null) continue;
      expected.set(r.species as string, (expected.get(r.species as string) ?? 0) + Number(r.cnt));
    }
    expect(result.length).toBe(expected.size);
    for (const r of result) expect(r.cnt).toBe(expected.get(r.species as string));

    // A second click clears it, from the cube chart.
    dataFilters
      .getState()
      .applyChartSelection(CUBE, ['island'], null, 0, dataPackage.getState().dimensionLinks);
    expect(dataFilters.getState().dataSelections[`col:${LINE}.island`]).toBeUndefined();
  });

  it('keeps the filter on the cube side when the link says so', () => {
    const { dataFilters, dataPackage } = setup({ values: ISLAND_NAMES, canonical: 'dimension' });
    selectIsland(dataFilters, LINE, ['Dream Island']);
    // A plain line-level write (no links passed) stays where it was made...
    expect(Object.keys(dataFilters.getState().dataSelections)).toEqual([`col:${LINE}.island`]);

    const dataFilters2 = createDataFiltersStore();
    dataFilters2
      .getState()
      .applyChartSelection(
        LINE,
        ['island'],
        { dataSourceKey: LINE, type: 'point', selection: { island: ['Dream Island'] } },
        0,
        dataPackage.getState().dimensionLinks,
      );
    // ...but through the links it moves to the cube, in the cube's spelling.
    expect(dataFilters2.getState().dataSelections).toEqual({
      [`col:${CUBE}.island`]: {
        dataSourceKey: CUBE,
        type: 'point',
        selection: { island: ['Dream'] },
      },
    });
  });

  it('a FilterData call on a cube dimension is kept on the line-level column', () => {
    const { dataFilters, dataPackage } = setup({ values: ISLAND_NAMES });
    const message = {
      role: 'assistant' as const,
      content: '',
      tool_calls: [
        {
          function: {
            name: 'FilterData',
            arguments: {
              title: 'Island',
              entity: CUBE,
              field: 'island',
              filter: {
                filterType: 'point',
                intervalRange: { min: 0, max: 0 },
                pointValues: ['Torgersen'],
              },
            } as unknown as Record<string, string>,
          },
        },
      ],
    };
    const anything = () => ({ isValid: 'yes' as const });
    dataFilters
      .getState()
      .syncFiltersFromMessages(
        [message],
        { isValidIntervalFilter: anything, isValidPointFilter: anything },
        dataPackage.getState().dimensionLinks,
      );
    expect(dataFilters.getState().dataSelections).toEqual({
      [`col:${LINE}.island`]: {
        dataSourceKey: LINE,
        type: 'point',
        selection: { island: ['Torgersen Island'] },
      },
    });
  });
});
