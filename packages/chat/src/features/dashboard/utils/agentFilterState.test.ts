import { describe, it, expect } from 'vitest';
import { agentFilterState } from './agentFilterState';
import type { ActiveFilter } from '../hooks/useFilterChips';
import type { Message } from '@/types/messages';

const filterCall = (args: Record<string, unknown>) => ({
  function: { name: 'FilterData', arguments: args as unknown as Record<string, string> },
});
const definition = {
  title: 'Diagnosis',
  entity: 'Event',
  field: 'diagnosis',
  filter: { filterType: 'point', intervalRange: { min: 0, max: 0 }, pointValues: ['Group 3'] },
};

describe('agentFilterState', () => {
  const messages: Message[] = [
    { role: 'user', content: 'group 3' },
    { role: 'assistant', content: '', tool_calls: [filterCall(definition)] },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        filterCall({ ...definition, op: 'modify', id: 'message-filter-1-0', title: 'Dx' }),
      ],
    },
  ];
  const active: ActiveFilter[] = [
    {
      // The user has since edited the values: the entry carries the edit.
      id: 'message-filter-1-0',
      origin: 'chat',
      selection: { dataSourceKey: 'Event', type: 'point', selection: { diagnosis: ['SHH'] } },
    },
    {
      id: 'udi_1_1',
      origin: 'chart',
      selection: {
        dataSourceKey: 'Patient',
        type: 'interval',
        // Cleared: the toolkit types a range as a pair, but a cleared one is `[]`.
        selection: { age: [2, 10], weight: [] as unknown as [number, number] },
      },
    },
  ];

  it('lists one entry per field, with current values, titles and scopes', () => {
    const scope = { entity: 'Patient', match: 'all' as const };
    expect(agentFilterState(active, { 'message-filter-1-0': scope }, messages)).toEqual([
      {
        id: 'message-filter-1-0',
        origin: 'chat',
        title: 'Dx',
        entity: 'Event',
        field: 'diagnosis',
        filterType: 'point',
        pointValues: ['SHH'],
        scope,
      },
      {
        id: 'udi_1_1',
        origin: 'chart',
        entity: 'Patient',
        field: 'age',
        filterType: 'interval',
        intervalRange: { min: 2, max: 10 },
      },
      // A cleared interval is still in place, with no range.
      {
        id: 'udi_1_1',
        origin: 'chart',
        entity: 'Patient',
        field: 'weight',
        filterType: 'interval',
      },
    ]);
  });
});
