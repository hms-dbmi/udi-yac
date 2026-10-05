import { describe, it, expect } from 'vitest';
import {
  createDataFiltersStore,
  containsFilterCall,
  extractAllFilterSpecsFromMessage,
  extractFilterSpecFromMessage,
  generateFilterMessage,
  messageFilterKey,
  messageFilterKeyWithToolCall,
  filterSpecForToolCall,
  selectionHasValue,
  type DataSelection,
} from './dataFiltersStore';
import type { Message, ToolCall } from '@/types/messages';
import type { ValidStatus } from '@/types/dataPackage';

const alwaysValid = {
  isValidIntervalFilter: (): ValidStatus => ({ isValid: 'yes' }),
  isValidPointFilter: (): ValidStatus => ({ isValid: 'yes' }),
};

const alwaysInvalid = {
  isValidIntervalFilter: (): ValidStatus => ({ isValid: 'no' }),
  isValidPointFilter: (): ValidStatus => ({ isValid: 'no' }),
};

/** Unverifiable, not invalid — e.g. a remote field with >80 distinct values. */
const alwaysUnknown = {
  isValidIntervalFilter: (): ValidStatus => ({ isValid: 'unknown' }),
  isValidPointFilter: (): ValidStatus => ({ isValid: 'unknown' }),
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

  it('picks the args of the requested tool call, not always the first', () => {
    const m: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        filterMessage('donors', 'age', 0, 10).tool_calls![0],
        {
          function: { name: 'RenderVisualization', arguments: {} as Record<string, string> },
        },
        filterMessage('samples', 'size', 1, 2).tool_calls![0],
      ],
    };
    expect(filterSpecForToolCall(m, 2)?.entity).toBe('samples');
    expect(filterSpecForToolCall(m, 0)?.entity).toBe('donors');
    // Mirrors messageFilterKey's own fallback to tool call 0.
    expect(filterSpecForToolCall(m)?.entity).toBe('donors');
    expect(filterSpecForToolCall(m, 1)).toBeNull();
    expect(filterSpecForToolCall({ role: 'user', content: '' })).toBeNull();
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

  // A brush filter's chat widget sits where the brush was made: the message
  // count when it first gets a value, per filter id (a point brush splits per
  // field), kept through edits and removal until a reset.
  it('anchors each brush filter at the message count of its first value', () => {
    const store = createDataFiltersStore();
    const point = (selection: Record<string, string[]>): DataSelection => ({
      dataSourceKey: 'donors',
      type: 'point',
      selection,
    });
    store.getState().updateInternalDataSelections({ u1: point({ sex: ['Female'] }) }, 3);
    expect(store.getState().brushAnchors).toEqual({ 'u1::sex': 3 });

    // A second field picked later gets its own, later anchor; the first stays.
    store
      .getState()
      .updateInternalDataSelections({ u1: point({ sex: ['Male'], race: ['Asian'] }) }, 7);
    expect(store.getState().brushAnchors).toEqual({ 'u1::sex': 3, 'u1::race': 7 });

    // Removed and brushed again: still where it first happened.
    store.getState().removeFilter('u1::sex');
    store
      .getState()
      .updateInternalDataSelections({ u1: point({ sex: ['Female'], race: ['Asian'] }) }, 9);
    expect(store.getState().brushAnchors['u1::sex']).toBe(3);

    // An empty selection anchors nothing; a reset forgets every anchor.
    store.getState().updateInternalDataSelections({ u2: point({ sex: [] }) }, 9);
    expect(store.getState().brushAnchors).not.toHaveProperty('u2::sex');
    store.getState().resetFilters();
    expect(store.getState().brushAnchors).toEqual({});
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

  it("clearFilter empties an LLM filter's fields, keeping the key and the field names", () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'point',
      selection: { sex: ['male'] },
    });
    store.getState().clearFilter('message-filter-0-0');
    const sel = store.getState().dataSelections['message-filter-0-0'];
    expect(sel).toBeDefined();
    // Nulling the selection left the message-anchored widget with no fields,
    // which renders as "Error: Invalid filter." Keep the field, drop values —
    // the shape the widget's own clear-all button produces.
    expect(sel.selection).toEqual({ sex: [] });
  });

  it('clearFilter keeps every field of a multi-field LLM filter', () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('message-filter-0-0', {
      dataSourceKey: 'donors',
      type: 'point',
      selection: { sex: ['male'], organ: ['Kidney'] },
    });
    store.getState().clearFilter('message-filter-0-0');
    expect(store.getState().dataSelections['message-filter-0-0'].selection).toEqual({
      sex: [],
      organ: [],
    });
  });

  it('clearFilter with a `uuid::field` key empties only that field of a split point filter', () => {
    const store = createDataFiltersStore();
    store.getState().updateInternalDataSelections({
      'uuid-1': {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { organization_name: ['CHOP'], event_type: ['Deceased'] },
      },
    });

    store.getState().clearFilter('uuid-1::event_type');
    // Sibling field keeps filtering; the cleared one stays in place, empty —
    // its chip reads "All" and its widget stays for re-selection.
    expect(store.getState().internalDataSelections['uuid-1'].selection).toEqual({
      organization_name: ['CHOP'],
      event_type: [],
    });
  });

  it('clearFilter empties an interval brush rather than nulling it', () => {
    const store = createDataFiltersStore();
    store.getState().updateInternalDataSelections({
      'uuid-1': { dataSourceKey: 'donors', type: 'interval', selection: { age: [10, 20] } },
    });
    store.getState().clearFilter('uuid-1');
    expect(store.getState().internalDataSelections['uuid-1'].selection).toEqual({ age: [] });
  });

  describe('remove / restore', () => {
    const point = (values: string[]): DataSelection => ({
      dataSourceKey: 'donors',
      type: 'point',
      selection: { sex: values },
    });

    it('removeFilter empties and flags; restoreFilter unflags and leaves it cleared', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', point(['male']));

      store.getState().removeFilter('message-filter-0-0');
      expect(store.getState().dataSelections['message-filter-0-0'].selection).toEqual({ sex: [] });
      expect(store.getState().removedFilters['message-filter-0-0']).toBe(true);

      store.getState().restoreFilter('message-filter-0-0');
      expect(store.getState().removedFilters['message-filter-0-0']).toBeUndefined();
      expect(store.getState().dataSelections['message-filter-0-0'].selection).toEqual({ sex: [] });
    });

    it('a fresh brush value re-activates a removed brush, and a later empty write keeps it', () => {
      const store = createDataFiltersStore();
      const brush = (values: string[]): DataSelection => ({
        dataSourceKey: 'Event',
        type: 'point',
        selection: { organization_name: values },
      });
      store.getState().updateInternalDataSelections({ 'uuid-1': brush(['CHOP']) });
      store.getState().removeFilter('uuid-1::organization_name');
      expect(store.getState().removedFilters['uuid-1::organization_name']).toBe(true);

      // The chart emits a new click.
      store.getState().updateInternalDataSelections({ 'uuid-1': brush(['UCSF']) });
      expect(store.getState().removedFilters['uuid-1::organization_name']).toBeUndefined();

      // Unticking the last value must not silently re-remove it.
      store.getState().setFilter('uuid-1::organization_name', brush([]));
      expect(store.getState().removedFilters['uuid-1::organization_name']).toBeUndefined();
    });

    it('setFilter merges a split point field back into its brush', () => {
      const store = createDataFiltersStore();
      store.getState().updateInternalDataSelections({
        'uuid-1': {
          dataSourceKey: 'Event',
          type: 'point',
          selection: { organization_name: ['CHOP'], event_type: ['Deceased'] },
        },
      });
      store.getState().setFilter('uuid-1::event_type', {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { event_type: ['Recurrence'] },
      });
      expect(store.getState().internalDataSelections['uuid-1'].selection).toEqual({
        organization_name: ['CHOP'],
        event_type: ['Recurrence'],
      });
    });

    it('clearAllFilters empties both maps and keeps every key and flag', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', point(['male']));
      store.getState().setDataSelection('message-filter-1-0', point(['female']));
      store.getState().removeFilter('message-filter-1-0');
      store.getState().updateInternalDataSelections({
        'uuid-1': { dataSourceKey: 'donors', type: 'interval', selection: { age: [1, 2] } },
      });

      store.getState().clearAllFilters();
      const s = store.getState();
      expect(s.dataSelections['message-filter-0-0'].selection).toEqual({ sex: [] });
      expect(s.internalDataSelections['uuid-1'].selection).toEqual({ age: [] });
      expect(s.removedFilters).toEqual({ 'message-filter-1-0': true });
    });
  });

  describe('host filters', () => {
    const host = (id: string, values: string[]) => ({
      id,
      dataSourceKey: 'donors',
      type: 'point' as const,
      selection: { sex: values },
    });

    it('upserts by id, and only when the entry itself changed', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])]);
      expect(store.getState().dataSelections['host-filter-a'].selection).toEqual({
        sex: ['male'],
      });

      // The user edits it; the host re-renders with the same prop.
      store.getState().setFilter('host-filter-a', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { sex: ['female'] },
      });
      store.getState().applyExternalFilters([host('a', ['male'])]);
      expect(store.getState().dataSelections['host-filter-a'].selection).toEqual({
        sex: ['female'],
      });

      // The host changes it.
      store.getState().applyExternalFilters([host('a', ['male', 'female'])]);
      expect(store.getState().dataSelections['host-filter-a'].selection).toEqual({
        sex: ['male', 'female'],
      });
    });

    it('deletes a filter the host dropped, and ignores echoed chat/chart filters', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])]);
      store.getState().applyExternalFilters([
        { ...host('message-filter-0-0', ['male']), origin: 'chat' },
        { ...host('uuid-1::sex', ['male']), origin: 'chart' },
      ]);
      expect(store.getState().dataSelections).toEqual({});
    });

    it('survives resetFilters, which clears the conversation’s filters and flags', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])]);
      store.getState().setDataSelection('message-filter-0-0', point(['male']));
      store.getState().removeFilter('message-filter-0-0');

      store.getState().resetFilters();
      expect(Object.keys(store.getState().dataSelections)).toEqual(['host-filter-a']);
      expect(store.getState().removedFilters).toEqual({});
    });

    it('is applied to the data, and kept out of the brush map', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])]);
      store.getState().updateInternalDataSelections({
        'host-filter-a': { dataSourceKey: 'donors', type: 'point', selection: { sex: ['x'] } },
      });
      expect(store.getState().internalDataSelections).toEqual({});
      expect(Object.keys(store.getState().getValidDataSelections(alwaysValid))).toEqual([
        'host-filter-a',
      ]);
    });

    const point = (values: string[]): DataSelection => ({
      dataSourceKey: 'donors',
      type: 'point',
      selection: { sex: values },
    });
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

    it('checks every field, not only the first', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('host-filter-a', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { sex: ['male'], no_such_field: ['x'] },
      });
      const onlySex = {
        ...alwaysValid,
        isValidPointFilter: (_e: string, field: string): ValidStatus => ({
          isValid: field === 'sex' ? 'yes' : 'no',
        }),
      };
      expect(store.getState().getValidDataSelections(onlySex)).toEqual({});
    });

    // Paired with the syncFiltersFromMessages test below: admission and
    // application must loosen together, or a filter renders a populated widget
    // while filtering nothing.
    it('keeps selections the validator cannot verify', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { donor_id: ['HBM123'] },
      });
      expect(Object.keys(store.getState().getValidDataSelections(alwaysUnknown))).toEqual([
        'message-filter-0-0',
      ]);
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

    it('admits filters the validator cannot verify', () => {
      const store = createDataFiltersStore();
      store.getState().syncFiltersFromMessages(
        [
          filterMessage('donors', 'donor_id', 0, 0, {
            filterType: 'point',
            pointValues: ['HBM123'],
          }),
        ],
        alwaysUnknown,
      );
      expect(store.getState().dataSelections['message-filter-0-0']).toEqual({
        dataSourceKey: 'donors',
        type: 'point',
        selection: { donor_id: ['HBM123'] },
      });
    });

    // "Filter by radiation type" names a field without values. The filter must
    // be in place with nothing picked — its widget lists the values — and
    // older agents' `[""]` default must not become a live filter on blanks.
    it.each([[[]], [['']]])(
      'admits a point filter without values (%j) as nothing picked',
      (pointValues) => {
        const store = createDataFiltersStore();
        store.getState().syncFiltersFromMessages(
          [
            filterMessage('radiation', 'radiation_type', 0, 0, {
              filterType: 'point',
              pointValues,
            }),
          ],
          alwaysValid,
        );
        const selection = store.getState().dataSelections['message-filter-0-0'];
        expect(selection.selection).toEqual({ radiation_type: [] });
        expect(selectionHasValue(selection)).toBe(false);
      },
    );

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
