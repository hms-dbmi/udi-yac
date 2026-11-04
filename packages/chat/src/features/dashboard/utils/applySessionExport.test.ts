import { describe, it, expect } from 'vitest';
import { createConversationStore } from '@/features/chat';
import { createDashboardStore } from '../stores/dashboardStore';
import { createDataFiltersStore } from '../stores/dataFiltersStore';
import { createMemoryBankStore } from '../stores/memoryBankStore';
import {
  buildSessionExport,
  currentSessionExport,
  parseSessionExport,
  type SessionExport,
} from './dashboardSerialization';
import { applySessionExport } from './applySessionExport';

const countBySex = {
  source: { name: 'donors', source: 'donors.csv' },
  transformation: [{ groupby: 'sex' }, { rollup: { donor_count: { op: 'count' } } }],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'sex', type: 'nominal' },
      { encoding: 'y', field: 'donor_count', type: 'quantitative' },
    ],
  },
} as unknown as SessionExport['visualizations'][number]['spec'];

function session(overrides: Partial<SessionExport> = {}): SessionExport {
  return {
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    conversation: { messages: [{ role: 'user', content: 'donors by sex' }] },
    visualizations: [
      {
        key: '0-0',
        uuid: 'viz-uuid',
        index: 0,
        toolCallIndex: 0,
        userPrompt: 'donors by sex',
        userTitle: 'Cohort',
        spec: countBySex,
      },
    ],
    layout: { items: [{ i: '0-0', x: 1, y: 2, w: 2, h: 5 }] },
    grid: { cols: 4, rowHeight: 80 },
    ...overrides,
  };
}

function stores() {
  return { conversation: createConversationStore(), dashboard: createDashboardStore() };
}

describe('applySessionExport', () => {
  it('restores the conversation, the cards and the grid config', () => {
    const s = stores();

    applySessionExport(session(), s, { donors: ['sex'] });

    expect(s.conversation.getState().messages).toEqual([
      { role: 'user', content: 'donors by sex' },
    ]);

    const dashboard = s.dashboard.getState();
    expect(dashboard.gridCols).toBe(4);
    expect(dashboard.gridRowHeight).toBe(80);

    const viz = dashboard.activeVisualizations.get('0-0');
    expect(viz).toBeTruthy();
    expect(viz!.uuid).toBe('viz-uuid');
    expect(viz!.userTitle).toBe('Cohort');
    // importDashboard re-injects interactivity, so the stored spec and the
    // rendered one are not the same object.
    expect(viz!.interactiveSpec).toBeTruthy();
    expect(dashboard.layout.items).toEqual([{ i: '0-0', x: 1, y: 2, w: 2, h: 5 }]);
  });

  it('applies the grid config before importing, so cards pack against the right column count', () => {
    const s = stores();
    // Two cards with no usable positions: the importer repacks them, and the
    // result depends on gridCols — which is only right if `grid` was applied
    // first. With cols=1 they stack; the ordering below would differ at cols=4.
    const two = session({
      grid: { cols: 1, rowHeight: 60 },
      visualizations: [
        { key: '0-0', uuid: 'a', index: 0, toolCallIndex: 0, userPrompt: 'a', spec: countBySex },
        { key: '1-0', uuid: 'b', index: 1, toolCallIndex: 0, userPrompt: 'b', spec: countBySex },
      ],
      layout: {
        items: [
          { i: '0-0', x: 0, y: 0, w: 1, h: 4 },
          { i: '1-0', x: 0, y: 0, w: 1, h: 4 },
        ],
      },
    });

    applySessionExport(two, s, null);

    const items = s.dashboard.getState().layout.items;
    expect(s.dashboard.getState().gridCols).toBe(1);
    expect(items).toHaveLength(2);
    expect(items.every((it) => it.x === 0)).toBe(true);
    expect(new Set(items.map((it) => it.y)).size).toBe(2);
  });

  it('tolerates an export with no grid block', () => {
    const s = stores();
    const before = s.dashboard.getState().gridRowHeight;

    applySessionExport(session({ grid: undefined }), s, null);

    expect(s.dashboard.getState().gridRowHeight).toBe(before);
    expect(s.dashboard.getState().activeVisualizations.size).toBe(1);
  });
});

describe('applySessionExport — filters', () => {
  const alwaysValid = {
    isValidIntervalFilter: () => ({ isValid: 'yes' as const }),
    isValidPointFilter: () => ({ isValid: 'yes' as const }),
  };
  const messages: SessionExport['conversation']['messages'] = [
    { role: 'user', content: 'group 3 events' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'FilterData',
            arguments: {
              title: 'Diagnosis',
              entity: 'Event',
              field: 'diagnosis',
              filter: {
                filterType: 'point',
                intervalRange: { min: 0, max: 0 },
                pointValues: ['Group 3'],
              },
            } as never,
          },
        },
      ],
    },
  ];
  const id = 'col:Event.diagnosis';

  /** Load a session the way the app does: apply it, then the sync effect runs. */
  function load(exported: SessionExport) {
    const s = { ...stores(), dataFilters: createDataFiltersStore() };
    applySessionExport(exported, s, {});
    s.dataFilters
      .getState()
      .syncFiltersFromMessages(s.conversation.getState().messages, alwaysValid);
    return s.dataFilters.getState();
  }

  it('round-trips the user’s edits and scope through export and import', () => {
    const original = createDataFiltersStore();
    original.getState().syncFiltersFromMessages(messages, alwaysValid);
    original.getState().setFilter(id, {
      dataSourceKey: 'Event',
      type: 'point',
      selection: { diagnosis: ['SHH'] },
    });
    original.getState().setFilterScope(id, { entity: 'Patient', match: 'all' });

    const exported = parseSessionExport(
      JSON.parse(
        JSON.stringify(
          buildSessionExport({
            messages,
            dashboard: { visualizations: [], layout: { items: [] } },
            filters: original.getState().exportFilterState(),
          }),
        ),
      ),
    );
    if (!exported.ok) throw new Error(exported.error);

    const restored = load(exported.value);
    expect(restored.dataSelections[id].selection).toEqual({ diagnosis: ['SHH'] });
    expect(restored.filterScopes[id]).toEqual({ entity: 'Patient', match: 'all' });
  });

  it('loads an older export without filter state as row-level filters from its messages', () => {
    const restored = load(
      session({ conversation: { messages }, visualizations: [], layout: { items: [] } }),
    );
    expect(restored.dataSelections[id].selection).toEqual({ diagnosis: ['Group 3'] });
    expect(restored.filterScopes).toEqual({});
  });

  it('round-trips a filter a chart made, which no message records', () => {
    const original = createDataFiltersStore();
    original
      .getState()
      .applyChartSelection(
        'Patient',
        ['sex'],
        { dataSourceKey: 'Patient', type: 'point', selection: { sex: ['F'] } },
        1,
      );
    const exported = parseSessionExport(
      JSON.parse(
        JSON.stringify(
          buildSessionExport({
            messages,
            dashboard: { visualizations: [], layout: { items: [] } },
            filters: original.getState().exportFilterState(),
          }),
        ),
      ),
    );
    if (!exported.ok) throw new Error(exported.error);

    const restored = load(exported.value);
    expect(restored.dataSelections['col:Patient.sex'].selection).toEqual({ sex: ['F'] });
    expect(restored.filterOrigins['col:Patient.sex']).toBe('chart');
    // Still placed in the chat where the chart made it, and still the chart's.
    expect(restored.brushAnchors['col:Patient.sex']).toBe(1);
  });

  it('re-keys an export saved before column ids', () => {
    const legacy = session({
      conversation: { messages },
      visualizations: [],
      layout: { items: [] },
      filters: {
        selections: {
          'message-filter-1-0': {
            dataSourceKey: 'Event',
            type: 'point',
            selection: { diagnosis: ['SHH'] },
          },
        },
        scopes: { 'message-filter-1-0': { entity: 'Patient', match: 'none' } },
        removed: [],
        origins: {},
        anchors: {},
      },
    });
    const restored = load(legacy);
    expect(Object.keys(restored.dataSelections)).toEqual([id]);
    expect(restored.dataSelections[id].selection).toEqual({ diagnosis: ['SHH'] });
    expect(restored.filterScopes[id]).toEqual({ entity: 'Patient', match: 'none' });
  });

  it('drops a malformed scope rather than the session', () => {
    const parsed = parseSessionExport({
      ...session(),
      filters: { selections: {}, scopes: { [id]: { entity: 'Patient', match: 'most' } } },
    });
    expect(parsed.ok && parsed.value.filters).toEqual({
      selections: {},
      scopes: {},
      removed: [],
      origins: {},
      anchors: {},
    });
  });
});

describe('closed charts and the sort flag', () => {
  const viz = (key: string) => ({
    key,
    uuid: `uuid-${key}`,
    index: Number(key[0]),
    toolCallIndex: 0,
    userPrompt: key,
    spec: countBySex,
  });

  function withBank() {
    return {
      ...stores(),
      dataFilters: createDataFiltersStore(),
      memoryBank: createMemoryBankStore(),
    };
  }

  it('round-trips a closed chart into the memory bank, not onto the grid', () => {
    const live = withBank();
    applySessionExport(
      session({ visualizations: [viz('0-0'), viz('1-0')], layout: { items: [] } }),
      live,
      { donors: ['sex'] },
    );
    live.dashboard.getState().closeVisualization('1-0', live.memoryBank);

    const exported = currentSessionExport(
      live.conversation.getState(),
      live.dashboard.getState(),
      live.dataFilters.getState(),
      live.memoryBank,
    );
    expect(exported.visualizations.map((v) => v.key)).toEqual(['0-0']);
    expect(exported.removedVisualizations?.map((v) => v.key)).toEqual(['1-0']);

    const parsed = parseSessionExport(JSON.parse(JSON.stringify(exported)));
    if (!parsed.ok) throw new Error(parsed.error);
    const restored = withBank();
    applySessionExport(parsed.value, restored, { donors: ['sex'] });

    expect([...restored.dashboard.getState().activeVisualizations.keys()]).toEqual(['0-0']);
    const closed = restored.memoryBank.getState().closedVisualizations.get('1-0');
    expect(closed?.uuid).toBe('uuid-1-0');
    expect(closed?.interactiveSpec).toBeTruthy();
  });

  it("replaces the previous session's closed charts", () => {
    const s = withBank();
    s.memoryBank.getState().addToMemoryBank('0-0', {} as never);
    applySessionExport(session(), s, { donors: ['sex'] });
    // A stale entry keyed like this session's chart would keep it off the grid.
    expect(s.memoryBank.getState().closedVisualizations.size).toBe(0);
    expect(s.dashboard.getState().activeVisualizations.has('0-0')).toBe(true);
  });

  it('round-trips the sort flag, on open and closed charts alike', () => {
    const live = withBank();
    applySessionExport(
      session({ visualizations: [viz('0-0'), viz('1-0'), viz('2-0')], layout: { items: [] } }),
      live,
      { donors: ['sex'] },
    );
    const dashboard = live.dashboard.getState();
    dashboard.toggleSortByTotal('0-0');
    dashboard.toggleSortByTotal('2-0');
    dashboard.closeVisualization('2-0', live.memoryBank);

    const exported = currentSessionExport(
      live.conversation.getState(),
      live.dashboard.getState(),
      live.dataFilters.getState(),
      live.memoryBank,
    );
    expect(exported.visualizations.map((v) => [v.key, v.sortByTotal])).toEqual([
      ['0-0', true],
      ['1-0', undefined],
    ]);
    expect(exported.removedVisualizations?.[0].sortByTotal).toBe(true);

    const parsed = parseSessionExport(JSON.parse(JSON.stringify(exported)));
    if (!parsed.ok) throw new Error(parsed.error);
    const restored = withBank();
    applySessionExport(parsed.value, restored, { donors: ['sex'] });
    expect([...restored.dashboard.getState().sortedByTotalKeys].sort()).toEqual(['0-0', '2-0']);
  });

  it('reads an older export with neither field', () => {
    const parsed = parseSessionExport(session());
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.removedVisualizations).toBeUndefined();
    expect(parsed.value.visualizations[0].sortByTotal).toBeUndefined();
  });

  it('drops a malformed closed chart rather than the session', () => {
    const parsed = parseSessionExport({
      ...session(),
      removedVisualizations: [viz('1-0'), { key: 'broken' }],
    });
    expect(parsed.ok && parsed.value.removedVisualizations?.map((v) => v.key)).toEqual(['1-0']);
  });
});
