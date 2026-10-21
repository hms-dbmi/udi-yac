import { describe, it, expect } from 'vitest';
import type { DataSelections } from '../stores/dataFiltersStore';
import { selectBrushFilters, brushHasValue } from './useBrushFilters';

const point = (field: string, values: string[]): DataSelections[string] => ({
  dataSourceKey: 'donors',
  type: 'point',
  selection: { [field]: values },
});

describe('selectBrushFilters', () => {
  const data: DataSelections = {
    'col:donors.sex': point('sex', ['F']),
    'col:donors.race': point('race', []),
    'col:donors.organ': point('organ', ['Kidney']),
  };

  it('lists the filters charts made, in the order they were made', () => {
    // organ was set in chat (no anchor); race was cleared but is still in place.
    const result = selectBrushFilters(data, { 'col:donors.race': 4, 'col:donors.sex': 2 });
    expect(result).toEqual([
      { id: 'col:donors.sex', selection: data['col:donors.sex'] },
      { id: 'col:donors.race', selection: data['col:donors.race'] },
    ]);
  });

  it('drops an anchor whose filter is gone', () => {
    expect(selectBrushFilters(data, { 'col:donors.age': 1 })).toEqual([]);
  });
});

describe('brushHasValue', () => {
  it('is false for an emptied selection and true for a picked one', () => {
    expect(brushHasValue(point('sex', []))).toBe(false);
    expect(brushHasValue(point('sex', ['F']))).toBe(true);
  });
});
