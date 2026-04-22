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

describe('dashboardStore — pinning / unpinning', () => {
  it('pinKey formats indices as "index-toolCallIndex"', () => {
    const store = createDashboardStore();
    expect(store.getState().pinKey(2, 3)).toBe('2-3');
  });

  it('pinVisualization stores the spec with a generated uuid', () => {
    const store = createDashboardStore();
    const spec = makeSpec();
    store
      .getState()
      .pinVisualization(0, 0, spec, 'show age', { donors: ['age_value', 'weight_value'] });
    const viz = store.getState().pinnedVisualizations.get('0-0');
    expect(viz?.uuid).toMatch(/^udi_/);
    expect(viz?.spec).toBe(spec);
    expect(viz?.interactiveSpec).not.toBe(spec);
  });

  it('pinVisualizationBatch inserts every item and is a no-op for empty arrays', () => {
    const store = createDashboardStore();
    const before = store.getState().pinnedVisualizations;
    store.getState().pinVisualizationBatch([]);
    expect(store.getState().pinnedVisualizations).toBe(before);

    store.getState().pinVisualizationBatch([
      { index: 0, toolCallIndex: 0, spec: makeSpec(), userPrompt: 'a', sourceFields: null },
      { index: 1, toolCallIndex: 0, spec: makeSpec(), userPrompt: 'b', sourceFields: null },
    ]);
    expect(store.getState().pinnedVisualizations.size).toBe(2);
  });

  it('isPinned reflects the current Map contents', () => {
    const store = createDashboardStore();
    store.getState().pinVisualization(0, 0, makeSpec(), '', null);
    expect(store.getState().isPinned('0-0')).toBe(true);
    expect(store.getState().isPinned('9-9')).toBe(false);
  });

  it('unpinVisualization without a memoryBankStore just removes the entry', () => {
    const store = createDashboardStore();
    store.getState().pinVisualization(0, 0, makeSpec(), '', null);
    store.getState().unpinVisualization('0-0');
    expect(store.getState().pinnedVisualizations.has('0-0')).toBe(false);
  });

  it('unpinVisualization moves the entry to the memoryBank when one is provided', () => {
    const dashboard = createDashboardStore();
    const memoryBank = createMemoryBankStore();
    dashboard.getState().pinVisualization(0, 0, makeSpec(), '', null);
    dashboard.getState().unpinVisualization('0-0', memoryBank);
    expect(dashboard.getState().pinnedVisualizations.has('0-0')).toBe(false);
    expect(memoryBank.getState().closedVisualizations.has('0-0')).toBe(true);
  });

  it('restoreFromMemoryBank re-pins and removes from the bank', () => {
    const dashboard = createDashboardStore();
    const memoryBank = createMemoryBankStore();
    dashboard.getState().pinVisualization(0, 0, makeSpec(), '', null);
    dashboard.getState().unpinVisualization('0-0', memoryBank);
    dashboard.getState().restoreFromMemoryBank('0-0', memoryBank);
    expect(dashboard.getState().pinnedVisualizations.has('0-0')).toBe(true);
    expect(memoryBank.getState().closedVisualizations.has('0-0')).toBe(false);
  });

  it('clearAllVisualizations empties pinned, expanded, and table-view state', () => {
    const store = createDashboardStore();
    store.getState().pinVisualization(0, 0, makeSpec(), '', null);
    store.getState().toggleExpanded('0-0');
    store.getState().toggleTableView('0-0');
    store.getState().clearAllVisualizations();
    expect(store.getState().pinnedVisualizations.size).toBe(0);
    expect(store.getState().expandedVisualizations.size).toBe(0);
    expect(store.getState().tableViewKeys.size).toBe(0);
  });
});

describe('dashboardStore — UI toggles', () => {
  it('toggleExpanded flips state and isExpanded matches', () => {
    const store = createDashboardStore();
    expect(store.getState().isExpanded('0-0')).toBe(false);
    store.getState().toggleExpanded('0-0');
    expect(store.getState().isExpanded('0-0')).toBe(true);
    store.getState().toggleExpanded('0-0');
    expect(store.getState().isExpanded('0-0')).toBe(false);
  });

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
});

describe('dashboardStore — updatePinnedVisualizationSpec', () => {
  it('replaces the spec and recomputes the interactive spec for the same uuid', () => {
    const store = createDashboardStore();
    store
      .getState()
      .pinVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    const original = store.getState().pinnedVisualizations.get('0-0')!;
    const newSpec = makeSpec({
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'organ', type: 'nominal' }],
      },
    });
    store.getState().updatePinnedVisualizationSpec('0-0', newSpec, { donors: ['organ'] });
    const after = store.getState().pinnedVisualizations.get('0-0')!;
    expect(after.uuid).toBe(original.uuid);
    expect(after.spec).toBe(newSpec);
    const rep = after.interactiveSpec.representation as { select: { name: string } };
    expect(rep.select.name).toBe(original.uuid);
  });

  it('is a no-op when the key is not pinned', () => {
    const store = createDashboardStore();
    const before = store.getState().pinnedVisualizations;
    store.getState().updatePinnedVisualizationSpec('0-0', makeSpec(), null);
    expect(store.getState().pinnedVisualizations).toBe(before);
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

  it('getFilterIds combines pinned viz uuids with valid external selection keys', () => {
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
      .pinVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    const pinned = dashboard.getState().pinnedVisualizations.get('0-0')!;

    dataFilters.getState().setDataSelection('message-filter-1-0', {
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age_value: [0, 50] },
    });

    // Use the real dataPackage validators
    const ids = dashboard.getState().getFilterIds(dataFilters);
    expect(ids).toContain(pinned.uuid);
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
      .pinVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const viz = dashboard.getState().pinnedVisualizations.get('0-0')!;
    const transformation = (viz.interactiveSpec as { transformation: Array<{ filter: string }> })
      .transformation;
    const filterStrings = transformation.map((t) => t.filter).filter(Boolean);
    expect(filterStrings).toContain("d['age_value'] != null");
    expect(filterStrings).toContain("d['weight_value'] != null");
  });

  it('updateSpecFilters omits null filters when filterAllNullValues is false', () => {
    const dashboard = createDashboardStore();
    const dataFilters = createDataFiltersStore();
    const dataPackage = buildDataPackageStoreWith([]);

    dashboard
      .getState()
      .pinVisualization(0, 0, makeSpec(), '', { donors: ['age_value', 'weight_value'] });
    dashboard.getState().setFilterAllNullValues(false);
    dashboard.getState().updateSpecFilters(dataFilters, dataPackage);

    const viz = dashboard.getState().pinnedVisualizations.get('0-0')!;
    const transformation = (viz.interactiveSpec as { transformation: Array<{ filter?: unknown }> })
      .transformation;
    // The null-filter transformations use `filter: string`. None should remain.
    const stringFilters = transformation.filter((t) => typeof t.filter === 'string');
    expect(stringFilters).toHaveLength(0);
  });
});
