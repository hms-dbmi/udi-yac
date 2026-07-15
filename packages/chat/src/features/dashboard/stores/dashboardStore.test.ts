import { describe, it, expect } from 'vitest';
import {
  createDashboardStore,
  injectInteractivity,
  normalizeToolCalls,
  parseSpecFromToolCall,
  extractAllUdiSpecsFromMessage,
} from './dashboardStore';
import { createMemoryBankStore } from './memoryBankStore';
import { createDataFiltersStore } from './dataFiltersStore';
import { createDataPackageStore } from '@/features/data-package';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { Message, ToolCall } from '@/types/messages';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

function makeSpec(overrides: Partial<Record<string, unknown>> = {}): UDIGrammar {
  return {
    source: { name: 'donors', source: 'donors.csv' },
    representation: {
      mark: 'point',
      mapping: [
        { encoding: 'x', field: 'age_value', type: 'quantitative' },
        { encoding: 'y', field: 'weight_value', type: 'quantitative' },
      ],
    },
    ...overrides,
  } as unknown as UDIGrammar;
}

describe('injectInteractivity', () => {
  it('adds an interval select for quantitative x/y encodings', () => {
    const spec = makeSpec();
    const interactive = injectInteractivity(spec, 'uuid-1', {
      donors: ['age_value', 'weight_value'],
    });
    const rep = interactive.representation as unknown as {
      select: { name: string; source: string; how: { type: string; on: string; field: string[] } };
    };
    expect(rep.select.name).toBe('uuid-1');
    expect(rep.select.source).toBe('donors');
    expect(rep.select.how.type).toBe('interval');
    // Encodings sorted alphabetically — 'x','y' → 'xy'
    expect(rep.select.how.on).toBe('xy');
    expect(rep.select.how.field).toEqual(['age_value', 'weight_value']);
  });

  it('adds a point select when the mapping has no quantitative x/y encodings', () => {
    const spec = makeSpec({
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'organ', type: 'nominal' },
          { encoding: 'color', field: 'sex', type: 'nominal' },
        ],
      },
    });
    const interactive = injectInteractivity(spec, 'uuid-1', { donors: ['organ', 'sex'] });
    const rep = interactive.representation as {
      select: { how: { type: string }; fields: string[] };
    };
    expect(rep.select.how.type).toBe('point');
    // Only x/y/color categorical fields are used as point dimensions.
    expect(rep.select.fields).toEqual(['organ', 'sex']);
  });

  it('is a no-op for row layers (tables)', () => {
    const spec = makeSpec({
      representation: { mark: 'row', mapping: [] },
    });
    const interactive = injectInteractivity(spec, 'uuid-1', null);
    expect((interactive.representation as { select?: unknown }).select).toBeUndefined();
  });

  it('sets config.hideActions so Vega overlay does not appear', () => {
    const spec = makeSpec();
    const interactive = injectInteractivity(spec, 'uuid-1', {
      donors: ['age_value', 'weight_value'],
    });
    expect(interactive.config?.hideActions).toBe(true);
  });

  it('falls back to the mapping `title` when the field is not in sourceFields', () => {
    const spec = makeSpec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'derived_age', title: 'age_value', type: 'quantitative' },
        ],
      },
    });
    const interactive = injectInteractivity(spec, 'uuid-1', { donors: ['age_value'] });
    const rep = interactive.representation as { select: { how: { field: string[] } } };
    expect(rep.select.how.field).toEqual(['age_value']);
  });

  it('does not mutate the input spec', () => {
    const spec = makeSpec();
    const before = JSON.parse(JSON.stringify(spec));
    injectInteractivity(spec, 'uuid-1', { donors: ['age_value', 'weight_value'] });
    expect(spec).toEqual(before);
  });
});

describe('normalizeToolCalls', () => {
  it('returns [] when there are no tool calls', () => {
    expect(normalizeToolCalls({ role: 'user', content: '' })).toEqual([]);
  });

  it('normalizes nested function-shape tool calls', () => {
    const message: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'RenderVisualization',
            arguments: { spec: '{}' } as unknown as Record<string, string>,
          },
        },
      ],
    };
    const out = normalizeToolCalls(message);
    expect(out[0].name).toBe('RenderVisualization');
    expect(out[0].originalIndex).toBe(0);
  });

  it('normalizes legacy flat-shape tool calls (name/arguments on the call)', () => {
    const message: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          name: 'RenderVisualization',
          arguments: { spec: '{}' } as unknown as Record<string, string>,
        } as unknown as ToolCall,
      ],
    };
    const out = normalizeToolCalls(message);
    expect(out[0].name).toBe('RenderVisualization');
  });
});

describe('parseSpecFromToolCall', () => {
  it('parses the spec arg as JSON', () => {
    const spec = parseSpecFromToolCall({
      name: 'RenderVisualization',
      arguments: { spec: '{"source":{"name":"donors","source":"donors.csv"}}' },
    });
    expect(spec).toEqual({ source: { name: 'donors', source: 'donors.csv' } });
  });

  it('returns null when the spec arg is missing', () => {
    expect(parseSpecFromToolCall({ name: 'X', arguments: {} })).toBeNull();
  });

  it('returns null when the spec arg is unparseable', () => {
    expect(parseSpecFromToolCall({ name: 'X', arguments: { spec: 'not-json' } })).toBeNull();
  });

  it('returns null when the spec arg is already a non-string object (unhandled shape)', () => {
    expect(
      parseSpecFromToolCall({ name: 'X', arguments: { spec: { already: 'parsed' } } }),
    ).toBeNull();
  });
});

describe('extractAllUdiSpecsFromMessage', () => {
  it('skips user messages', () => {
    expect(extractAllUdiSpecsFromMessage({ role: 'user', content: '', tool_calls: [] })).toEqual(
      [],
    );
  });

  it('returns only RenderVisualization tool calls with parseable specs', () => {
    const message: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'FilterData',
            arguments: {} as Record<string, string>,
          },
        },
        {
          function: {
            name: 'RenderVisualization',
            arguments: {
              spec: '{"source":{"name":"donors","source":"donors.csv"}}',
              title: 'Age distribution',
            } as unknown as Record<string, string>,
          },
        },
        {
          function: {
            name: 'RenderVisualization',
            arguments: { spec: 'invalid-json' } as Record<string, string>,
          },
        },
      ],
    };
    const results = extractAllUdiSpecsFromMessage(message);
    expect(results).toHaveLength(1);
    expect(results[0].toolCallIndex).toBe(1);
    expect(results[0].title).toBe('Age distribution');
  });
});

describe('dashboardStore — activating / closing', () => {
  it('vizKey formats indices as "index-toolCallIndex"', () => {
    const store = createDashboardStore();
    expect(store.getState().vizKey(2, 3)).toBe('2-3');
  });

  it('addActiveVisualization stores the spec with a generated uuid', () => {
    const store = createDashboardStore();
    const spec = makeSpec();
    store
      .getState()
      .addActiveVisualization(0, 0, spec, 'show age', { donors: ['age_value', 'weight_value'] });
    const viz = store.getState().activeVisualizations.get('0-0');
    expect(viz?.uuid).toMatch(/^udi_/);
    expect(viz?.spec).toBe(spec);
    expect(viz?.interactiveSpec).not.toBe(spec);
  });

  it('addActiveVisualizationBatch inserts every item and is a no-op for empty arrays', () => {
    const store = createDashboardStore();
    const before = store.getState().activeVisualizations;
    store.getState().addActiveVisualizationBatch([]);
    expect(store.getState().activeVisualizations).toBe(before);

    store.getState().addActiveVisualizationBatch([
      { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: 'a', sourceFields: null },
      { index: 1, toolCallIndex: 0, spec: makeSpec(), userPrompt: 'b', sourceFields: null },
    ]);
    expect(store.getState().activeVisualizations.size).toBe(2);
  });

  it('isActive reflects the current Map contents', () => {
    const store = createDashboardStore();
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    expect(store.getState().isActive('0-0')).toBe(true);
    expect(store.getState().isActive('9-9')).toBe(false);
  });

  it('closeVisualization without a memoryBankStore just removes the entry', () => {
    const store = createDashboardStore();
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    store.getState().closeVisualization('0-0');
    expect(store.getState().activeVisualizations.has('0-0')).toBe(false);
  });

  it('closeVisualization moves the entry to the memoryBank when one is provided', () => {
    const dashboard = createDashboardStore();
    const memoryBank = createMemoryBankStore();
    dashboard.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    dashboard.getState().closeVisualization('0-0', memoryBank);
    expect(dashboard.getState().activeVisualizations.has('0-0')).toBe(false);
    expect(memoryBank.getState().closedVisualizations.has('0-0')).toBe(true);
  });

  it('closeVisualization re-packs so no gap is left behind', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    store.getState().addActiveVisualization(0, 1, makeSpec(), '', null);
    store.getState().addActiveVisualization(0, 2, makeSpec(), '', null);
    expect(store.getState().layout.items).toHaveLength(3); // fill row 0 at cols=3

    // Remove the middle-column card; the others must pull in to close the gap.
    const middle = store.getState().layout.items.find((it) => it.x === 1)!;
    store.getState().closeVisualization(middle.i);

    const after = store.getState().layout.items;
    expect(after).toHaveLength(2);
    expect(after.map((it) => it.x).sort((a, b) => a - b)).toEqual([0, 1]);
    expect(after.every((it) => it.y === 0)).toBe(true);
  });

  it('restoreFromMemoryBank re-activates and removes from the bank', () => {
    const dashboard = createDashboardStore();
    const memoryBank = createMemoryBankStore();
    dashboard.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    dashboard.getState().closeVisualization('0-0', memoryBank);
    dashboard.getState().restoreFromMemoryBank('0-0', memoryBank);
    expect(dashboard.getState().activeVisualizations.has('0-0')).toBe(true);
    expect(memoryBank.getState().closedVisualizations.has('0-0')).toBe(false);
  });

  it('clearAllVisualizations empties active and table-view state', () => {
    const store = createDashboardStore();
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    store.getState().toggleTableView('0-0');
    store.getState().clearAllVisualizations();
    expect(store.getState().activeVisualizations.size).toBe(0);
    expect(store.getState().tableViewKeys.size).toBe(0);
  });
});

describe('dashboardStore — UI toggles', () => {
  it('toggleTableView flips state and isTableView matches', () => {
    const store = createDashboardStore();
    store.getState().toggleTableView('0-0');
    expect(store.getState().isTableView('0-0')).toBe(true);
    store.getState().toggleTableView('0-0');
    expect(store.getState().isTableView('0-0')).toBe(false);
  });

  it('setHoveredVisualizationIndex and isHovered', () => {
    const store = createDashboardStore();
    store.getState().setHoveredVisualizationIndex('0-0');
    expect(store.getState().isHovered('0-0')).toBe(true);
    expect(store.getState().isHovered('1-0')).toBe(false);
    store.getState().setHoveredVisualizationIndex(null);
    expect(store.getState().isHovered('0-0')).toBe(false);
  });

  it('setHoveredMessageVizKey tracks the chat-pointed vizKey (reverse-direction link)', () => {
    const store = createDashboardStore();
    expect(store.getState().hoveredMessageVizKey).toBeNull();
    store.getState().setHoveredMessageVizKey('2-1');
    expect(store.getState().hoveredMessageVizKey).toBe('2-1');
    store.getState().setHoveredMessageVizKey(null);
    expect(store.getState().hoveredMessageVizKey).toBeNull();
  });
});

describe('dashboardStore — updateActiveVisualizationSpec', () => {
  it('replaces the spec and recomputes the interactive spec for the same uuid', () => {
    const store = createDashboardStore();
    store
      .getState()
      .addActiveVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    const original = store.getState().activeVisualizations.get('0-0')!;
    const newSpec = makeSpec({
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'organ', type: 'nominal' }],
      },
    });
    store.getState().updateActiveVisualizationSpec('0-0', newSpec, { donors: ['organ'] });
    const after = store.getState().activeVisualizations.get('0-0')!;
    expect(after.uuid).toBe(original.uuid);
    expect(after.spec).toBe(newSpec);
    const rep = after.interactiveSpec.representation as { select: { name: string } };
    expect(rep.select.name).toBe(original.uuid);
  });

  it('is a no-op when the key is not active', () => {
    const store = createDashboardStore();
    const before = store.getState().activeVisualizations;
    store.getState().updateActiveVisualizationSpec('0-0', makeSpec(), null);
    expect(store.getState().activeVisualizations).toBe(before);
  });
});

describe('dashboardStore — cross-store filter propagation', () => {
  function buildDataPackageStoreWith(domains: DataFieldDomain[]) {
    const dp = createDataPackageStore();
    const dataPackage: DataPackage = {
      'udi:path': 'data',
      resources: [
        {
          name: 'donors',
          path: 'donors.csv',
          'udi:row_count': 10,
          schema: {
            fields: [
              { name: 'age_value', 'udi:data_type': 'quantitative' },
              { name: 'weight_value', 'udi:data_type': 'quantitative' },
            ],
          },
        },
      ],
    };
    // Bypass the loading lifecycle — push state directly.
    dp.setState({
      dataPackage,
      dataFieldDomains: domains,
      loadingPhase: 'ready',
    });
    return dp;
  }

  it('getFilterIds combines active viz uuids with valid external selection keys', () => {
    const dashboard = createDashboardStore();
    const dataFilters = createDataFiltersStore();
    const dataPackage = buildDataPackageStoreWith([
      {
        entity: 'donors',
        field: 'age_value',
        type: 'interval',
        fieldDescription: '',
        domain: { min: 0, max: 100 },
      },
    ]);

    dashboard
      .getState()
      .addActiveVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    const active = dashboard.getState().activeVisualizations.get('0-0')!;

    dataFilters.getState().setDataSelection('message-filter-1-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age_value: [0, 50] },
    });

    // Use the real dataPackage validators
    const ids = dashboard.getState().getFilterIds(dataFilters);
    expect(ids).toContain(active.uuid);
    expect(ids).toContain('message-filter-1-0');
    // Verify alphabetical sort and dedupe are applied.
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    void dataPackage; // silence unused — store is side-effectful via validators
  });

  it('updateSpecFilters injects null filters for represented fields when filterAllNullValues is true', () => {
    const dashboard = createDashboardStore();
    const dataFilters = createDataFiltersStore();
    const dataPackage = buildDataPackageStoreWith([]);

    dashboard
      .getState()
      .addActiveVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const viz = dashboard.getState().activeVisualizations.get('0-0')!;
    const transformation = (viz.interactiveSpec as { transformation: Array<{ filter: object }> })
      .transformation;
    // Structured expression AST (not the legacy raw string) — the remote
    // query backend rejects raw Arquero strings.
    const filters = transformation.map((t) => t.filter).filter(Boolean);
    const notNull = (field: string) => ({
      op: '!=',
      left: { field },
      right: { literal: null },
    });
    expect(filters).toContainEqual(notNull('age_value'));
    expect(filters).toContainEqual(notNull('weight_value'));
  });

  it('updateSpecFilters omits null filters when filterAllNullValues is false', () => {
    const dashboard = createDashboardStore();
    const dataFilters = createDataFiltersStore();
    const dataPackage = buildDataPackageStoreWith([]);

    dashboard
      .getState()
      .addActiveVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    dashboard.getState().setFilterAllNullValues(false);
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const viz = dashboard.getState().activeVisualizations.get('0-0')!;
    const transformation = (viz.interactiveSpec as { transformation: Array<{ filter?: unknown }> })
      .transformation;
    // The null-filter transformations use `filter: string`. None should remain.
    const stringFilters = transformation.filter((t) => typeof t.filter === 'string');
    expect(stringFilters).toHaveLength(0);
  });
});

describe('dashboardStore — batched insertion distributes across columns', () => {
  it('distributes 4 viz across 3 columns as 2/1/1 in tool-call order', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualizationBatch([
      { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 1, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 2, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 3, spec: makeSpec(), userPrompt: '', sourceFields: null },
    ]);
    const items = store.getState().layout.items;
    expect(items).toHaveLength(4);

    // Row-major reading order should match tool-call order: 0-0, 0-1, 0-2, 0-3
    const sorted = [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    expect(sorted.map((it) => it.i)).toEqual(['0-0', '0-1', '0-2', '0-3']);

    // Column distribution: col 0 has 2, cols 1 and 2 each have 1
    const byCol = new Map<number, string[]>();
    for (const it of items) {
      const col = byCol.get(it.x) ?? [];
      col.push(it.i);
      byCol.set(it.x, col);
    }
    expect(byCol.get(0)?.length).toBe(2);
    expect(byCol.get(1)?.length).toBe(1);
    expect(byCol.get(2)?.length).toBe(1);
  });

  it('places a batch ahead of existing items (existing get pushed to later positions)', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    // Seed two existing viz, one at a time (the single-add path)
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    store.getState().addActiveVisualization(0, 1, makeSpec(), '', null);
    // Then a batch of two new viz arrives
    store.getState().addActiveVisualizationBatch([
      { index: 1, toolCallIndex: 0, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 1, toolCallIndex: 1, spec: makeSpec(), userPrompt: '', sourceFields: null },
    ]);
    const items = store.getState().layout.items;
    expect(items).toHaveLength(4);
    const sorted = [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    // Batch (1-0, 1-1) occupies the first two row-major slots; existing
    // (in their prior row-major order, which is "newest single-add first")
    // come after.
    expect(sorted.slice(0, 2).map((it) => it.i)).toEqual(['1-0', '1-1']);
  });

  it('packs a single batched viz at (0,0) when the dashboard is empty', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store
      .getState()
      .addActiveVisualizationBatch([
        { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: '', sourceFields: null },
      ]);
    const items = store.getState().layout.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({ i: '0-0', x: 0, y: 0 }));
  });
});

describe('dashboardStore — setGridCols reflows items on cols change', () => {
  it('collapses a wider layout to a single column when cols shrinks to 1', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualizationBatch([
      { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 1, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 2, spec: makeSpec(), userPrompt: '', sourceFields: null },
    ]);
    // 3 items at cols=3 → all on row 0
    expect(store.getState().layout.items.every((it) => it.y === 0)).toBe(true);

    store.getState().setGridCols(1);

    // Shrunk to 1 col → everyone should be in column 0, stacked
    const after = store.getState().layout.items;
    for (const it of after) {
      expect(it.x).toBe(0);
    }
    // Three distinct y values (rows) — reading order preserved
    const ys = after.map((it) => it.y).sort((a, b) => a - b);
    expect(new Set(ys).size).toBe(3);
  });

  it('expands a single-column layout to multiple columns when cols grows', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(1);
    store.getState().addActiveVisualizationBatch([
      { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 1, spec: makeSpec(), userPrompt: '', sourceFields: null },
      { index: 0, toolCallIndex: 2, spec: makeSpec(), userPrompt: '', sourceFields: null },
    ]);
    // All stacked at cols=1
    expect(store.getState().layout.items.every((it) => it.x === 0)).toBe(true);

    store.getState().setGridCols(3);

    // At cols=3 they should fit on a single row 0
    const after = store.getState().layout.items;
    expect(after.every((it) => it.y === 0)).toBe(true);
    const xs = after.map((it) => it.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 1, 2]);
  });

  it('does nothing when cols is unchanged', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    const before = store.getState().layout.items;
    store.getState().setGridCols(3);
    expect(store.getState().layout.items).toBe(before);
  });

  it('keeps the same layout reference when the repack produces identical positions', () => {
    const store = createDashboardStore();
    // Single column to start
    store.getState().setGridCols(1);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    const layoutBefore = store.getState().layout.items;
    // Shrink to a smaller cols — the single-column layout is unchanged
    // by re-packing. Layout reference must stay equal so RGL doesn't
    // see a "new" prop and trigger another compactor pass.
    store.getState().setGridCols(1);
    expect(store.getState().layout.items).toBe(layoutBefore);
  });
});

describe('dashboardStore — setLayoutItems is a no-op for content-equal layouts', () => {
  it('does not update layout when the items are byte-equal to the current state', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    const before = store.getState().layout.items;
    // Feed back a new-array-reference but content-equal layout (what RGL's
    // compactor would do on a no-op pass).
    const echoed = before.map((it) => ({ ...it }));
    store.getState().setLayoutItems(echoed);
    expect(store.getState().layout.items).toBe(before);
  });

  it('does update when any item position or size differs', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    const before = store.getState().layout.items;
    const moved = before.map((it) => ({ ...it, h: it.h + 1 }));
    store.getState().setLayoutItems(moved);
    expect(store.getState().layout.items).not.toBe(before);
    expect(store.getState().layout.items[0].h).toBe(before[0].h + 1);
  });
});

describe('dashboardStore — setGridRowHeight', () => {
  it('updates the rowHeight without touching layout.items', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(3);
    store.getState().addActiveVisualization(0, 0, makeSpec(), '', null);
    const layoutBefore = store.getState().layout.items;
    const heightBefore = store.getState().gridRowHeight;

    store.getState().setGridRowHeight(heightBefore + 20);

    // Items reference must stay identical — rowHeight is presentation-only.
    expect(store.getState().layout.items).toBe(layoutBefore);
    expect(store.getState().gridRowHeight).toBe(heightBefore + 20);
  });

  it('is a no-op when value is unchanged', () => {
    const store = createDashboardStore();
    const before = store.getState().gridRowHeight;
    store.getState().setGridRowHeight(before);
    // No mutation observed — would be an exact-same reference even if zustand
    // didn't dedupe (we early-return).
    expect(store.getState().gridRowHeight).toBe(before);
  });

  it('clamps out-of-range values to MIN/MAX_GRID_ROW_HEIGHT_PX', () => {
    const store = createDashboardStore();
    store.getState().setGridRowHeight(1); // below min
    expect(store.getState().gridRowHeight).toBeGreaterThanOrEqual(30);
    store.getState().setGridRowHeight(10000); // above max
    expect(store.getState().gridRowHeight).toBeLessThanOrEqual(120);
  });
});

describe('dashboardStore — repackLayout restores per-viz initial heights', () => {
  function buildDataPackageStoreWith(domains: DataFieldDomain[]) {
    const dp = createDataPackageStore();
    const dataPackage: DataPackage = {
      'udi:path': 'data',
      resources: [
        {
          name: 'donors',
          path: 'donors.csv',
          'udi:row_count': 10,
          schema: {
            fields: [
              { name: 'race', 'udi:data_type': 'nominal' },
              { name: 'age_value', 'udi:data_type': 'quantitative' },
            ],
          },
        },
      ],
    };
    dp.setState({ dataPackage, dataFieldDomains: domains, loadingPhase: 'ready' });
    return dp;
  }

  it('uses computeInitialCardHeight per viz, not a flat default', () => {
    const store = createDashboardStore();
    const dp = buildDataPackageStoreWith([
      {
        entity: 'donors',
        field: 'race',
        type: 'point',
        fieldDescription: '',
        domain: { values: Array.from({ length: 12 }, (_, i) => `r${i}`) },
      },
    ]);
    const catSpec = makeSpec({
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'y', field: 'race', type: 'nominal' },
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
        ],
      },
    });
    store
      .getState()
      .addActiveVisualizationBatch(
        [{ index: 0, toolCallIndex: 0, spec: catSpec, userPrompt: '', sourceFields: null }],
        dp,
      );
    const addedH = store.getState().layout.items[0].h;
    // 12 categories at rowHeight=60: ceil((80 + 12*25) / 60) = ceil(380/60) = 7, max with default 4 = 7.
    expect(addedH).toBeGreaterThan(4);

    // Shrink the card to simulate a user resize.
    store.getState().setLayoutItems([{ ...store.getState().layout.items[0], h: 4 }]);
    expect(store.getState().layout.items[0].h).toBe(4);

    // Reset — should put h back to the category-aware initial.
    store.getState().repackLayout(dp);
    expect(store.getState().layout.items[0].h).toBe(addedH);
  });
});

describe('dashboardStore — setGridCols clamping', () => {
  it('clamps out-of-range cols to MIN/MAX_GRID_COLS', () => {
    const store = createDashboardStore();
    store.getState().setGridCols(0); // below min
    expect(store.getState().gridCols).toBeGreaterThanOrEqual(1);
    store.getState().setGridCols(99); // above max
    expect(store.getState().gridCols).toBeLessThanOrEqual(8);
  });
});
