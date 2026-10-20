import { describe, it, expect } from 'vitest';
import type { DataSelection, DataSelections } from '../stores/dataFiltersStore';
import type { ActiveVisualization } from '../stores/dashboardStore';
import type { ValidStatus } from '@/types/dataPackage';
import { formatSelectionFields, selectFilters } from './useFilterChips';
import { formatTime } from 'udi-toolkit/react';

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

describe('formatSelectionFields', () => {
  const same = (s: string) => s;
  const sel: DataSelection = {
    dataSourceKey: 'events',
    type: 'interval',
    selection: {
      created_timestamp: [1637434970889, 1749678978392],
      age_at_event_days: [365.25, 4383],
      size: [1, 2],
    },
  };
  const formats: Record<string, string> = {
    created_timestamp: 'epoch_ms',
    age_at_event_days: 'days',
  };

  it('shows a time field in its format and other bounds as numbers', () => {
    const chips = formatSelectionFields(sel, same, same, undefined, (f) => formats[f]);
    expect(chips).toEqual([
      {
        label: 'created_timestamp',
        value: `${formatTime(1637434970889, 'epoch_ms')}\u2013${formatTime(1749678978392, 'epoch_ms')}`,
      },
      { label: 'age_at_event_days', value: '1.0 y\u201312.0 y' },
      { label: 'size', value: '1\u20132' },
    ]);
  });
});
