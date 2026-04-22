import { describe, it, expect } from 'vitest';
import {
  createDataFiltersStore,
  containsFilterCall,
  extractAllFilterSpecsFromMessage,
  extractFilterSpecFromMessage,
  generateFilterMessage,
  messageFilterKey,
  messageFilterKeyWithToolCall,
  type DataSelection,
} from './dataFiltersStore';
import type { Message, ToolCall } from '@/types/messages';

const alwaysValid = {
  isValidIntervalFilter: () => ({ isValid: 'yes' }),
  isValidPointFilter: () => ({ isValid: 'yes' }),
};

const alwaysInvalid = {
  isValidIntervalFilter: () => ({ isValid: 'no' }),
  isValidPointFilter: () => ({ isValid: 'no' }),
};

function filterMessage(
  entity: string,
  field: string,
  min: number,
  max: number,
  opts: { filterType?: 'interval' | 'point'; pointValues?: string[] } = {},
): Message {
  const filterType = opts.filterType ?? 'interval';
  const tool_call: ToolCall = {
    function: {
      name: 'FilterData',
      arguments: {
        title: `${entity}.${field}`,
        entity,
        field,
        filter: {
          filterType,
          intervalRange: { min, max },
          pointValues: opts.pointValues ?? [],
        },
      } as unknown as Record<string, string>,
    },
  };
  return { role: 'assistant', content: '', tool_calls: [tool_call] };
}

describe('messageFilterKey helpers', () => {
  it('builds the default key from indices when no linkedVisFilterId is set', () => {
    expect(messageFilterKey(3)).toBe('message-filter-3-0');
    expect(messageFilterKeyWithToolCall(3, 2)).toBe('message-filter-3-2');
  });

  it('prefers linkedVisFilterId when present on the message', () => {
    const m: Message = { role: 'user', content: '', linkedVisFilterId: 'brush-abc' };
    expect(messageFilterKey(0, m)).toBe('brush-abc');
    expect(messageFilterKeyWithToolCall(0, 1, m)).toBe('brush-abc');
  });
});

describe('containsFilterCall', () => {
  it('returns true when any tool call is FilterData', () => {
    expect(containsFilterCall(filterMessage('donors', 'age', 0, 100))).toBe(true);
  });

  it('returns false for messages with no tool calls', () => {
    expect(containsFilterCall({ role: 'user', content: 'hello' })).toBe(false);
  });

  it('returns false when only non-FilterData tool calls are present', () => {
    const m: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'RenderVisualization',
            arguments: {} as Record<string, string>,
          },
        },
      ],
    };
    expect(containsFilterCall(m)).toBe(false);
  });
});

describe('extractAllFilterSpecsFromMessage', () => {
  it('returns an empty array when there are no tool calls', () => {
    expect(extractAllFilterSpecsFromMessage({ role: 'user', content: '' })).toEqual([]);
  });

  it('extracts every FilterData tool call with its original index', () => {
    const m: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        filterMessage('donors', 'age', 0, 10).tool_calls![0],
        {
          function: {
            name: 'RenderVisualization',
            arguments: {} as Record<string, string>,
          },
        },
        filterMessage('samples', 'size', 1, 2).tool_calls![0],
      ],
    };
    const extracted = extractAllFilterSpecsFromMessage(m);
    expect(extracted.map((e) => e.toolCallIndex)).toEqual([0, 2]);
    expect(extracted[0].args.entity).toBe('donors');
    expect(extracted[1].args.entity).toBe('samples');
  });

  it('normalizes legacy `{min, max}` shape into the current filter.intervalRange shape', () => {
    const m: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'FilterData',
            arguments: {
              entity: 'donors',
              field: 'age',
              min: 10,
              max: 90,
            } as unknown as Record<string, string>,
          },
        },
      ],
    };
    const spec = extractFilterSpecFromMessage(m);
    expect(spec?.filter.filterType).toBe('interval');
    expect(spec?.filter.intervalRange).toEqual({ min: 10, max: 90 });
  });
});

describe('generateFilterMessage', () => {
  it('returns null when the selection is empty', () => {
    const sel: DataSelection = { dataSourceKey: 'donors', type: 'interval', selection: {} };
    expect(generateFilterMessage('k', sel)).toBeNull();
  });

  it('emits one FilterData tool call per selected field with a linkedVisFilterId', () => {
    const sel: DataSelection = {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [10, 90], weight: [50, 80] },
    };
    const m = generateFilterMessage('brush-k', sel);
    expect(m?.role).toBe('user');
    expect(m?.linkedVisFilterId).toBe('brush-k');
    expect(m?.tool_calls).toHaveLength(2);
    expect(m?.tool_calls?.[0].function.name).toBe('FilterData');
  });
});

describe('dataFiltersStore', () => {
  it('resetFilters clears both internal and external selections', () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [0, 10] },
    });
    store.getState().updateInternalDataSelections({
      brush1: { dataSourceKey: 'donors', type: 'interval', selection: { age: [0, 10] } },
    });
    store.getState().resetFilters();
    expect(store.getState().dataSelections).toEqual({});
    expect(store.getState().internalDataSelections).toEqual({});
  });

  it('setDataSelection adds/overwrites by key', () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [0, 10] },
    });
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [5, 20] },
    });
    expect(store.getState().dataSelections['message-filter-0-0'].selection!.age).toEqual([5, 20]);
  });

  it('updateInternalDataSelections skips keys prefixed with message-filter-', () => {
    const store = createDataFiltersStore();
    store.getState().updateInternalDataSelections({
      'message-filter-0-0': {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [0, 10] },
      },
      brush1: { dataSourceKey: 'donors', type: 'interval', selection: { age: [0, 10] } },
    });
    expect(store.getState().internalDataSelections).toEqual({
      brush1: { dataSourceKey: 'donors', type: 'interval', selection: { age: [0, 10] } },
    });
  });

  it('updateInternalDataSelections is a no-op when values are unchanged', () => {
    const store = createDataFiltersStore();
    store.getState().updateInternalDataSelections({
      brush1: { dataSourceKey: 'donors', type: 'interval', selection: { age: [0, 10] } },
    });
    const before = store.getState().internalDataSelections;
    store.getState().updateInternalDataSelections({
      brush1: { dataSourceKey: 'donors', type: 'interval', selection: { age: [0, 10] } },
    });
    expect(store.getState().internalDataSelections).toBe(before);
  });

  it('clearFilter nulls the selection but preserves the key', () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [0, 10] },
    });
    store.getState().clearFilter('message-filter-0-0');
    const sel = store.getState().dataSelections['message-filter-0-0'];
    expect(sel).toBeDefined();
    expect(sel.selection).toBeNull();
  });

  describe('getValidDataSelections', () => {
    it('drops selections that are not message-filter-prefixed', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('brush-not-from-message', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [0, 10] },
      });
      expect(store.getState().getValidDataSelections(alwaysValid)).toEqual({});
    });

    it('drops empty and all-empty-array selections', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: {},
      });
      store.getState().setDataSelection('message-filter-1-0', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [] },
      });
      expect(store.getState().getValidDataSelections(alwaysValid)).toEqual({});
    });

    it('drops selections the validator rejects', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [0, 10] },
      });
      expect(store.getState().getValidDataSelections(alwaysInvalid)).toEqual({});
    });

    it('keeps point selections that pass validation', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { sex: ['male'] },
      });
      const valid = store.getState().getValidDataSelections(alwaysValid);
      expect(Object.keys(valid)).toEqual(['message-filter-0-0']);
    });
  });

  describe('syncFiltersFromMessages', () => {
    it('materializes interval selections from FilterData tool calls in messages', () => {
      const store = createDataFiltersStore();
      const messages: Message[] = [filterMessage('donors', 'age', 0, 100)];
      store.getState().syncFiltersFromMessages(messages, alwaysValid);
      expect(store.getState().dataSelections['message-filter-0-0']).toEqual({
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [0, 100] },
      });
    });

    it('skips messages whose selections fail validation', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .syncFiltersFromMessages([filterMessage('donors', 'age', 0, 100)], alwaysInvalid);
      expect(store.getState().dataSelections).toEqual({});
    });

    it('does not overwrite an existing selection for the same key', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [5, 50] },
      });
      store
        .getState()
        .syncFiltersFromMessages([filterMessage('donors', 'age', 0, 100)], alwaysValid);
      expect(store.getState().dataSelections['message-filter-0-0'].selection!.age).toEqual([5, 50]);
    });
  });

  describe('syncSelectionsBackToMessages', () => {
    it('writes the store interval ranges back into the message tool call args', () => {
      const store = createDataFiltersStore();
      const messages: Message[] = [filterMessage('donors', 'age', 0, 100)];
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [25, 75] },
      });
      store.getState().syncSelectionsBackToMessages(messages);
      const args = messages[0].tool_calls![0].function.arguments as unknown as {
        filter: { intervalRange: { min: number; max: number } };
      };
      expect(args.filter.intervalRange).toEqual({ min: 25, max: 75 });
    });

    it('ignores selections whose key does not encode a message index', () => {
      const store = createDataFiltersStore();
      const messages: Message[] = [filterMessage('donors', 'age', 0, 100)];
      store.getState().setDataSelection('brush-foo', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [25, 75] },
      });
      // Should not throw and should not mutate the message.
      store.getState().syncSelectionsBackToMessages(messages);
      const args = messages[0].tool_calls![0].function.arguments as unknown as {
        filter: { intervalRange: { min: number; max: number } };
      };
      expect(args.filter.intervalRange).toEqual({ min: 0, max: 100 });
    });
  });
});
