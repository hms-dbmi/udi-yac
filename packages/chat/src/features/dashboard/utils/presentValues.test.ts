import { describe, it, expect } from 'vitest';
import type { DataTransformation } from 'udi-toolkit';
import type { DataSelections } from '../stores/dataFiltersStore';
import type { ActiveFilter } from './cubeFilters';
import { otherFilterIds, presentCubeValuesSpec, presentValuesSpec } from './presentValues';

const source = { name: 'Efs', source: 'data/efs.csv' };

describe('otherFilterIds', () => {
  const selections = {
    'col:Efs.protocol': {
      type: 'point',
      dataSourceKey: 'Efs',
      selection: { protocol: ['PBTC026'] },
    },
    'col:Efs.diagnosis': {
      type: 'point',
      dataSourceKey: 'Efs',
      selection: { diagnosis: ['ATRT'] },
    },
    'host-filter-1': { type: 'point', dataSourceKey: 'Efs', selection: { protocol: ['ACNS0334'] } },
    'col:Os.sex': { type: 'point', dataSourceKey: 'Os', selection: { sex: ['F'] } },
  } as unknown as DataSelections;
  const ids = [
    'col:Efs.diagnosis',
    'col:Efs.protocol',
    'col:Os.sex',
    'host-filter-1',
    'link:Os.protocol<-Efs.protocol',
    'link:Efs.protocol<-Os.protocol',
    'link:Os.diagnosis<-Efs.diagnosis',
  ];

  it('leaves out every filter on the edited column and its mirrors either way', () => {
    expect(otherFilterIds(ids, selections, 'col:Efs.protocol', 'Efs', ['protocol'])).toEqual([
      'col:Efs.diagnosis',
      'col:Os.sex',
      'link:Os.diagnosis<-Efs.diagnosis',
    ]);
  });

  it('leaves out all of a multi-field filter', () => {
    expect(
      otherFilterIds(ids, selections, 'col:Efs.protocol', 'Efs', ['protocol', 'diagnosis']),
    ).toEqual(['col:Os.sex']);
  });
});

describe('presentValuesSpec', () => {
  const named = [{ filter: { name: 'col:Efs.diagnosis' } }] as DataTransformation[];

  it('groups the filtered rows by the field', () => {
    expect(presentValuesSpec(source, 'protocol', named)?.transformation).toEqual([
      ...named,
      { groupby: ['protocol'] },
      { rollup: { n: { op: 'count' } } },
    ]);
  });

  it('runs no query when no filter reaches the table', () => {
    expect(presentValuesSpec(source, 'protocol', [])).toBeNull();
  });
});

describe('presentCubeValuesSpec', () => {
  const cube = { dimensions: ['diagnosis', 'protocol', 'sex'], measures: ['cnt', 'median'] };
  const measureOp = (m: string) => (m === 'cnt' ? ('sum' as const) : null);
  const diagnosis: ActiveFilter = {
    id: 'col:Efs.diagnosis',
    sourceName: 'Efs',
    fields: ['diagnosis'],
  };

  it('expands to the marginal holding the field and the filtered dimensions', () => {
    const built = presentCubeValuesSpec(source, 'protocol', cube, [diagnosis], measureOp);
    expect(built?.measure).toBe('cnt');
    expect(built?.spec.transformation).toEqual([
      { only: ['diagnosis', 'protocol'] },
      { filter: { name: 'col:Efs.diagnosis' } },
      { groupby: ['protocol'] },
      { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
    ]);
  });

  it('runs no query when no filter applies to the cube', () => {
    const other: ActiveFilter = { id: 'col:Os.sex', sourceName: 'Os', fields: ['sex'] };
    expect(presentCubeValuesSpec(source, 'protocol', cube, [], measureOp)).toBeNull();
    expect(presentCubeValuesSpec(source, 'protocol', cube, [other], measureOp)).toBeNull();
  });

  it('runs no query on a cube with no measure that re-aggregates', () => {
    expect(presentCubeValuesSpec(source, 'protocol', cube, [diagnosis], () => null)).toBeNull();
  });
});
