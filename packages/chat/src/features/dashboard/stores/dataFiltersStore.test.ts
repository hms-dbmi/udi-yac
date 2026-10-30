import { describe, it, expect } from 'vitest';
import {
  createDataFiltersStore,
  containsFilterCall,
  extractAllFilterSpecsFromMessage,
  extractFilterOperationsFromMessage,
  extractFilterSpecFromMessage,
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

const pointSel = (selection: Record<string, string[]>): DataSelection => ({
  dataSourceKey: 'donors',
  type: 'point',
  selection,
});

const pointMessage = (entity: string, field: string, values: string[]) =>
  filterMessage(entity, field, 0, 0, { filterType: 'point', pointValues: values });

describe('messageFilterKeyWithToolCall', () => {
  it('builds the default key from indices when no linkedVisFilterId is set', () => {
    expect(messageFilterKeyWithToolCall(3, 2)).toBe('message-filter-3-2');
  });

  it('prefers linkedVisFilterId when present on the message', () => {
    const m: Message = { role: 'user', content: '', linkedVisFilterId: 'brush-abc' };
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

describe('dataFiltersStore', () => {
  it('resetFilters clears the conversation’s filters, their origins and anchors', () => {
    const store = createDataFiltersStore();
    store.getState().setDataSelection('col:donors.age', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [0, 10] },
    });
    store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['Female'] }), 2);
    store.getState().resetFilters();
    const s = store.getState();
    expect(s.dataSelections).toEqual({});
    expect(s.filterOrigins).toEqual({});
    expect(s.brushAnchors).toEqual({});
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

  describe('applyChartSelection', () => {
    const id = 'col:donors.sex';

    it('writes each field into its column filter, anchored where the chart made it', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyChartSelection(
          'donors',
          ['sex', 'race'],
          pointSel({ sex: ['F'], race: ['Asian'] }),
          3,
        );
      const s = store.getState();
      expect(s.dataSelections).toEqual({
        [id]: pointSel({ sex: ['F'] }),
        'col:donors.race': pointSel({ race: ['Asian'] }),
      });
      expect(s.filterOrigins).toEqual({ [id]: 'chart', 'col:donors.race': 'chart' });
      expect(s.brushAnchors).toEqual({ [id]: 3, 'col:donors.race': 3 });
    });

    it('replaces a chat filter on the same column, keeping its scope and widget', () => {
      const store = createDataFiltersStore();
      store.getState().syncFiltersFromMessages([pointMessage('donors', 'sex', ['M'])], alwaysValid);
      store.getState().setFilterScope(id, { entity: 'Patient', match: 'any' });

      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['F'] }), 5);
      const s = store.getState();
      expect(Object.keys(s.dataSelections)).toEqual([id]);
      expect(s.dataSelections[id].selection).toEqual({ sex: ['F'] });
      expect(s.filterOrigins[id]).toBe('chart');
      expect(s.filterScopes[id]).toEqual({ entity: 'Patient', match: 'any' });
      // Its widget is the chat message's: no chart anchor.
      expect(s.brushAnchors).toEqual({});
    });

    it('a chart clearing its selection drops its own filters and empties chat ones', () => {
      const store = createDataFiltersStore();
      store.getState().syncFiltersFromMessages([pointMessage('donors', 'sex', ['M'])], alwaysValid);
      store.getState().applyChartSelection('donors', ['race'], pointSel({ race: ['Asian'] }), 1);

      store.getState().applyChartSelection('donors', ['sex', 'race'], null, 2);
      const s = store.getState();
      expect(s.dataSelections).toEqual({ [id]: pointSel({ sex: [] }) });
      expect(s.filterOrigins).toEqual({ [id]: 'chat' });
    });

    // The empty-bubble report: a range made in chat, moved on a chart, then
    // cleared on that chart. Dropping it left the chat message with nothing.
    it('a chart clearing a filter a message shows empties it, even after changing it', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .syncFiltersFromMessages([filterMessage('donors', 'age', 0, 100)], alwaysValid);
      const range = (min: number, max: number): DataSelection => ({
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [min, max] },
      });
      store.getState().applyChartSelection('donors', ['age'], range(20, 40), 1);
      expect(store.getState().filterOrigins['col:donors.age']).toBe('chart');

      store.getState().applyChartSelection('donors', ['age'], null, 2);
      expect(store.getState().dataSelections['col:donors.age']).toEqual({
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [] },
      });
    });

    it('a chat add claims a chart-made filter: its widget is now the message', () => {
      const store = createDataFiltersStore();
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['F'] }), 1);
      expect(store.getState().brushAnchors).toEqual({ [id]: 1 });
      store.getState().syncFiltersFromMessages([pointMessage('donors', 'sex', ['M'])], alwaysValid);
      expect(store.getState().brushAnchors).toEqual({});
      // So clearing it on the chart now empties rather than drops it.
      store.getState().applyChartSelection('donors', ['sex'], null, 2);
      expect(store.getState().dataSelections[id]).toEqual(pointSel({ sex: [] }));
    });

    it('a fresh value re-activates a removed filter', () => {
      const store = createDataFiltersStore();
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['F'] }), 1);
      store.getState().removeFilter(id);
      expect(store.getState().removedFilters[id]).toBe(true);
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['M'] }), 2);
      expect(store.getState().removedFilters[id]).toBeUndefined();
      // Still anchored where the chart first made it.
      expect(store.getState().brushAnchors[id]).toBe(1);
    });

    it('is a no-op when the values are what the filter already holds', () => {
      const store = createDataFiltersStore();
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['F'] }), 1);
      const before = store.getState().dataSelections;
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['F'] }), 4);
      expect(store.getState().dataSelections).toBe(before);
    });

    it('a brush writes an interval over a point filter on the same column', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('col:donors.age', pointSel({ age: ['30'] }));
      store
        .getState()
        .applyChartSelection(
          'donors',
          ['age'],
          { dataSourceKey: 'donors', type: 'interval', selection: { age: [20, 40] } },
          1,
        );
      expect(store.getState().dataSelections['col:donors.age']).toEqual({
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [20, 40] },
      });
    });
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

    it('clearAllFilters empties every filter and keeps every key and flag', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('message-filter-0-0', point(['male']));
      store.getState().setDataSelection('message-filter-1-0', point(['female']));
      store.getState().removeFilter('message-filter-1-0');
      store
        .getState()
        .applyChartSelection(
          'donors',
          ['age'],
          { dataSourceKey: 'donors', type: 'interval', selection: { age: [1, 2] } },
          0,
        );

      store.getState().clearAllFilters();
      const s = store.getState();
      expect(s.dataSelections['message-filter-0-0'].selection).toEqual({ sex: [] });
      expect(s.dataSelections['col:donors.age'].selection).toEqual({ age: [] });
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

    it('is applied to the data, and a chart never writes over it', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])]);
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['x'] }), 0);
      expect(store.getState().dataSelections['host-filter-a'].selection).toEqual({ sex: ['male'] });
      expect(Object.keys(store.getState().getValidDataSelections(alwaysValid)).sort()).toEqual([
        'col:donors.sex',
        'host-filter-a',
      ]);
    });

    const point = (values: string[]): DataSelection => ({
      dataSourceKey: 'donors',
      type: 'point',
      selection: { sex: values },
    });

    it('ignores a scope on the filtered table itself, which would reach no table', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyExternalFilters([
          { ...host('a', ['male']), scope: { entity: 'donors', match: 'any' } },
        ]);
      expect(store.getState().filterScopes).toEqual({});
    });
  });

  describe('host filters — shared mode', () => {
    const host = (id: string, values: string[]) => ({
      id,
      dataSourceKey: 'donors',
      type: 'point' as const,
      selection: { sex: values },
    });
    const sex = (store: ReturnType<typeof createDataFiltersStore>) =>
      store.getState().dataSelections['col:donors.sex']?.selection;

    it('makes a one-field host filter its column’s filter, origin host', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])], 'shared');
      expect(Object.keys(store.getState().dataSelections)).toEqual(['col:donors.sex']);
      expect(sex(store)).toEqual({ sex: ['male'] });
      expect(store.getState().filterOrigins['col:donors.sex']).toBe('host');
    });

    it('lets a chart click take the column over, last edit winning', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])], 'shared');
      store.getState().applyChartSelection('donors', ['sex'], pointSel({ sex: ['female'] }), 0);
      expect(sex(store)).toEqual({ sex: ['female'] });
      expect(store.getState().filterOrigins['col:donors.sex']).toBe('chart');

      // The host follows the click: its new value is what the column holds,
      // so the chart stays the column's last editor.
      store.getState().applyExternalFilters([host('a', ['female'])], 'shared');
      expect(store.getState().filterOrigins['col:donors.sex']).toBe('chart');

      // Dropping the entry leaves a column the host no longer owns.
      store.getState().applyExternalFilters([], 'shared');
      expect(sex(store)).toEqual({ sex: ['female'] });
    });

    it('removes the column filter when the host drops an entry it still owns', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])], 'shared');
      store.getState().applyExternalFilters([], 'shared');
      expect(store.getState().dataSelections).toEqual({});
      expect(store.getState().filterOrigins).toEqual({});
    });

    it('keeps a filter on several fields separate', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyExternalFilters(
          [{ ...host('a', ['male']), selection: { sex: ['male'], race: ['x'] } }],
          'shared',
        );
      expect(Object.keys(store.getState().dataSelections)).toEqual(['host-filter-a']);
    });

    it('survives a reset and stays out of a session export', () => {
      const store = createDataFiltersStore();
      store.getState().applyExternalFilters([host('a', ['male'])], 'shared');
      store.getState().resetFilters();
      expect(sex(store)).toEqual({ sex: ['male'] });
      expect(store.getState().filterOrigins['col:donors.sex']).toBe('host');
      expect(store.getState().exportFilterState().selections).toEqual({});
    });
  });

  describe('getValidDataSelections', () => {
    it('drops selections that are not filters', () => {
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
      store.getState().setDataSelection('col:donors.weight', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: {},
      });
      store.getState().setDataSelection('col:donors.age', {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [] },
      });
      expect(store.getState().getValidDataSelections(alwaysValid)).toEqual({});
    });

    it('drops selections the validator rejects', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('col:donors.age', {
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
      store.getState().setDataSelection('col:donors.donor_id', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { donor_id: ['HBM123'] },
      });
      expect(Object.keys(store.getState().getValidDataSelections(alwaysUnknown))).toEqual([
        'col:donors.donor_id',
      ]);
    });

    it('keeps point selections that pass validation', () => {
      const store = createDataFiltersStore();
      store.getState().setDataSelection('col:donors.sex', {
        dataSourceKey: 'donors',
        type: 'point',
        selection: { sex: ['male'] },
      });
      const valid = store.getState().getValidDataSelections(alwaysValid);
      expect(Object.keys(valid)).toEqual(['col:donors.sex']);
    });
  });

  describe('syncFiltersFromMessages', () => {
    it('materializes interval selections from FilterData tool calls in messages', () => {
      const store = createDataFiltersStore();
      const messages: Message[] = [filterMessage('donors', 'age', 0, 100)];
      store.getState().syncFiltersFromMessages(messages, alwaysValid);
      expect(store.getState().dataSelections['col:donors.age']).toEqual({
        dataSourceKey: 'donors',
        type: 'interval',
        selection: { age: [0, 100] },
      });
      expect(store.getState().filterOrigins['col:donors.age']).toBe('chat');
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
      expect(store.getState().dataSelections['col:donors.donor_id']).toEqual({
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
        const selection = store.getState().dataSelections['col:radiation.radiation_type'];
        expect(selection.selection).toEqual({ radiation_type: [] });
        expect(selectionHasValue(selection)).toBe(false);
      },
    );

    it('an add replaces what its column held, a chart filter included', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyChartSelection(
          'donors',
          ['age'],
          { dataSourceKey: 'donors', type: 'interval', selection: { age: [5, 50] } },
          0,
        );
      store
        .getState()
        .syncFiltersFromMessages([filterMessage('donors', 'age', 0, 100)], alwaysValid);
      expect(store.getState().dataSelections['col:donors.age'].selection!.age).toEqual([0, 100]);
      expect(store.getState().filterOrigins['col:donors.age']).toBe('chat');
    });
  });

  describe('filter operations', () => {
    /** One assistant message carrying these FilterData calls. */
    function opsMessage(...args: Record<string, unknown>[]): Message {
      return {
        role: 'assistant',
        content: '',
        tool_calls: args.map((a) => ({
          function: { name: 'FilterData', arguments: a as unknown as Record<string, string> },
        })),
      };
    }
    const group3 = {
      title: 'Diagnosis',
      entity: 'Event',
      field: 'diagnosis',
      filter: {
        filterType: 'point',
        intervalRange: { min: 0, max: 0 },
        pointValues: ['Group 3'],
      },
    };
    const patientScope = { entity: 'Patient', match: 'any' };
    const DX = 'col:Event.diagnosis';

    function synced(messages: Message[]) {
      const store = createDataFiltersStore();
      store.getState().syncFiltersFromMessages(messages, alwaysValid);
      return store;
    }

    it('extracts every operation in order, and only definitions as specs', () => {
      const m = opsMessage(group3, { op: 'remove', id: 'message-filter-0-0' }, { op: 'clear' });
      expect(extractFilterOperationsFromMessage(m).map((o) => o.args.op)).toEqual([
        undefined,
        'remove',
        'clear',
      ]);
      expect(extractAllFilterSpecsFromMessage(m).map((o) => o.toolCallIndex)).toEqual([0]);
    });

    it('records the scope an add carries', () => {
      const store = synced([opsMessage({ ...group3, scope: patientScope })]);
      expect(store.getState().filterScopes).toEqual({ [DX]: patientScope });
    });

    // A modify names its target by column id; one written before column ids
    // names the add's `message-filter-{i}-{j}`, which still lands.
    it.each([[DX], ['message-filter-0-0']])(
      'modifies a filter in place: same id, new values and scope (id %s)',
      (id) => {
        const store = synced([
          opsMessage(group3),
          opsMessage({
            ...group3,
            op: 'modify',
            id,
            filter: { ...group3.filter, pointValues: ['Group 4'] },
            scope: patientScope,
          }),
        ]);
        const { dataSelections, filterScopes } = store.getState();
        expect(Object.keys(dataSelections)).toEqual([DX]);
        expect(dataSelections[DX].selection).toEqual({ diagnosis: ['Group 4'] });
        expect(filterScopes[DX]).toEqual(patientScope);
      },
    );

    it('two adds on one column are one filter: the later replaces the earlier', () => {
      const later = { ...group3, filter: { ...group3.filter, pointValues: ['SHH'] } };
      const store = synced([opsMessage(group3), opsMessage(later)]);
      expect(Object.keys(store.getState().dataSelections)).toEqual([DX]);
      expect(store.getState().dataSelections[DX].selection).toEqual({ diagnosis: ['SHH'] });
    });

    it('modifies and removes a filter a chart made', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyChartSelection(
          'Event',
          ['diagnosis'],
          { dataSourceKey: 'Event', type: 'point', selection: { diagnosis: ['SHH'] } },
          0,
        );
      store
        .getState()
        .syncFiltersFromMessages([opsMessage({ ...group3, op: 'modify', id: DX })], alwaysValid);
      expect(store.getState().dataSelections[DX].selection).toEqual({ diagnosis: ['Group 3'] });
      expect(store.getState().filterOrigins[DX]).toBe('chat');

      store
        .getState()
        .syncFiltersFromMessages(
          [opsMessage({ ...group3, op: 'modify', id: DX }), opsMessage({ op: 'remove', id: DX })],
          alwaysValid,
        );
      expect(store.getState().dataSelections).toEqual({});
    });

    it('a modify can move a filter to another column', () => {
      const store = synced([
        opsMessage(group3),
        opsMessage({ ...group3, op: 'modify', id: DX, field: 'site' }),
      ]);
      expect(Object.keys(store.getState().dataSelections)).toEqual(['col:Event.site']);
    });

    it('a modify without a scope makes the filter row-level again', () => {
      const store = synced([
        opsMessage({ ...group3, scope: patientScope }),
        opsMessage({ ...group3, op: 'modify', id: DX }),
      ]);
      expect(store.getState().filterScopes).toEqual({});
    });

    it('removes a filter, and clears every chat and chart filter but no host one', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyExternalFilters([
          { id: 'site', dataSourceKey: 'Event', type: 'point', selection: { site: ['A'] } },
        ]);
      const messages = [
        opsMessage(group3, { ...group3, field: 'site' }),
        opsMessage({ op: 'remove', id: 'col:Event.site' }),
      ];
      store.getState().syncFiltersFromMessages(messages, alwaysValid);
      expect(Object.keys(store.getState().dataSelections).sort()).toEqual([DX, 'host-filter-site']);
      store
        .getState()
        .applyChartSelection(
          'Event',
          ['grade'],
          { dataSourceKey: 'Event', type: 'point', selection: { grade: ['2'] } },
          2,
        );

      store
        .getState()
        .syncFiltersFromMessages([...messages, opsMessage({ op: 'clear' })], alwaysValid);
      expect(Object.keys(store.getState().dataSelections)).toEqual(['host-filter-site']);
    });

    it('never touches a host filter, whatever the call says', () => {
      const store = createDataFiltersStore();
      store
        .getState()
        .applyExternalFilters([
          { id: 'site', dataSourceKey: 'Event', type: 'point', selection: { site: ['A'] } },
        ]);
      store
        .getState()
        .syncFiltersFromMessages(
          [
            opsMessage(
              { ...group3, op: 'modify', id: 'host-filter-site' },
              { op: 'remove', id: 'host-filter-site' },
            ),
          ],
          alwaysValid,
        );
      expect(store.getState().dataSelections['host-filter-site'].selection).toEqual({
        site: ['A'],
      });
    });

    it('applies each operation once, so later syncs keep the user’s edits', () => {
      const messages = [
        opsMessage(group3),
        opsMessage({ ...group3, op: 'modify', id: DX, scope: patientScope }),
      ];
      const store = synced(messages);
      const edited: DataSelection = {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { diagnosis: ['SHH'] },
      };
      store.getState().setFilter(DX, edited);
      store.getState().setFilterScope(DX, null);

      store
        .getState()
        .syncFiltersFromMessages([...messages, { role: 'user', content: 'thanks' }], alwaysValid);

      expect(store.getState().dataSelections[DX]).toEqual(edited);
      expect(store.getState().filterScopes).toEqual({});
    });

    it('a reset replays the conversation to the same final state', () => {
      const messages = [
        opsMessage(group3, { ...group3, field: 'site' }),
        opsMessage(
          { ...group3, op: 'modify', id: 'message-filter-0-0', scope: patientScope },
          { op: 'remove', id: 'message-filter-0-1' },
        ),
        opsMessage({ ...group3, field: 'grade' }),
      ];
      const store = synced(messages);
      const before = store.getState();

      store.getState().resetFilters();
      store.getState().syncFiltersFromMessages(messages, alwaysValid);

      expect(store.getState().dataSelections).toEqual(before.dataSelections);
      expect(store.getState().filterScopes).toEqual(before.filterScopes);
      expect(Object.keys(before.dataSelections).sort()).toEqual([DX, 'col:Event.grade']);
    });

    it('a modify of a filter that is gone does nothing', () => {
      const store = synced([
        opsMessage(group3),
        opsMessage({ op: 'remove', id: 'message-filter-0-0' }),
        opsMessage({ ...group3, op: 'modify', id: 'message-filter-0-0' }),
      ]);
      expect(store.getState().dataSelections).toEqual({});
    });

    it('host filters carry their scope in and drop it with the filter', () => {
      const store = createDataFiltersStore();
      const host = {
        id: 'site',
        dataSourceKey: 'Event',
        type: 'point' as const,
        selection: { site: ['A'] },
        scope: { entity: 'Patient', match: 'none' as const },
      };
      store.getState().applyExternalFilters([host]);
      expect(store.getState().filterScopes['host-filter-site']).toEqual(host.scope);
      store.getState().resetFilters();
      expect(store.getState().filterScopes['host-filter-site']).toEqual(host.scope);
      store.getState().applyExternalFilters([]);
      expect(store.getState().filterScopes).toEqual({});
    });
  });
});
