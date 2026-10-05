import { describe, it, expect } from 'vitest';
import type { DataSelections } from '../stores/dataFiltersStore';
import type { ActiveVisualization } from '../stores/dashboardStore';
import type { ValidStatus } from '@/types/dataPackage';
import { selectFilters } from './useFilterChips';

const valid = {
  isValidIntervalFilter: (): ValidStatus => ({ isValid: 'yes' }),
  isValidPointFilter: (): ValidStatus => ({ isValid: 'yes' }),
};

const active = new Map([
  ['0-0', { uuid: 'uuid-1', userPrompt: 'p' } as unknown as ActiveVisualization],
]);

const data: DataSelections = {
  'message-filter-0-0': { dataSourceKey: 'donors', type: 'point', selection: { sex: [] } },
  'message-filter-1-0': { dataSourceKey: 'donors', type: 'point', selection: { race: ['x'] } },
  'host-filter-a': { dataSourceKey: 'donors', type: 'interval', selection: { age: [1, 2] } },
};
const internal: DataSelections = {
  'uuid-1': { dataSourceKey: 'donors', type: 'interval', selection: { weight: [] } },
};

describe('selectFilters', () => {
  it('lists cleared filters, tags each origin, and leaves removed ones out', () => {
    const result = selectFilters(data, internal, active, { 'message-filter-1-0': true }, valid);
    expect(result.map((f) => [f.id, f.origin])).toEqual([
      ['message-filter-0-0', 'chat'],
      ['host-filter-a', 'host'],
      ['uuid-1', 'chart'],
    ]);
  });

  it('leaves out a filter with any inadmissible field', () => {
    const noAge = {
      ...valid,
      isValidIntervalFilter: (_e: string, field: string): ValidStatus => ({
        isValid: field === 'age' ? 'no' : 'yes',
      }),
    };
    const ids = selectFilters(data, {}, active, {}, noAge).map((f) => f.id);
    expect(ids).not.toContain('host-filter-a');
  });
});
