import { createStore, type StoreApi } from 'zustand/vanilla';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { Message } from '@/types/messages';
import type { DataFiltersState } from './dataFiltersStore';
import type { DataPackageState } from '@/features/data-package';
import type { MemoryBankState } from './memoryBankStore';
import type { EntityRelationship } from '@/types/dataPackage';
import type { DataTransformation } from 'udi-toolkit';

export interface PinnedVisualization {
  index: number;
  toolCallIndex: number;
  spec: UDIGrammar;
  interactiveSpec: UDIGrammar;
  userPrompt: string;
  title?: string;
  uuid: string;
}

export interface ExtractedSpec {
  spec: object;
  toolCallIndex: number;
  title?: string;
}

export interface DashboardState {
  pinnedVisualizations: Map<string, PinnedVisualization>;
  filterAllNullValues: boolean;
  expandedVisualizations: Set<string>;
  tableViewKeys: Set<string>;
  hoveredVisualizationIndex: string | null;
  pinKey: (messageIndex: number, toolCallIndex: number) => string;
  pinVisualization: (
    index: number,
    toolCallIndex: number,
    spec: UDIGrammar,
    userPrompt: string,
    sourceFields: Record<string, string[]> | null,
    title?: string,
  ) => void;
  pinVisualizationBatch: (
    items: Array<{
      index: number;
      toolCallIndex: number;
      spec: UDIGrammar;
      userPrompt: string;
      sourceFields: Record<string, string[]> | null;
      title?: string;
    }>,
  ) => void;
  unpinVisualization: (key: string, memoryBankStore?: StoreApi<MemoryBankState>) => void;
  restoreFromMemoryBank: (key: string, memoryBankStore: StoreApi<MemoryBankState>) => void;
  isPinned: (key: string) => boolean;
  clearAllVisualizations: () => void;
  setFilterAllNullValues: (value: boolean) => void;
  toggleExpanded: (key: string) => void;
  isExpanded: (key: string) => boolean;
  toggleTableView: (key: string) => void;
  isTableView: (key: string) => boolean;
  setHoveredVisualizationIndex: (key: string | null) => void;
  isHovered: (key: string) => boolean;
  updateSpecFilters: (
    dataFiltersStore: StoreApi<DataFiltersState>,
    dataPackageStore: StoreApi<DataPackageState>,
  ) => void;
  getNamedFilters: (
    filterIdList: string[],
    currentSourceName: string,
    dataFiltersStore: StoreApi<DataFiltersState>,
    dataPackageStore: StoreApi<DataPackageState>,
  ) => object[];
  getFilterIds: (dataFiltersStore: StoreApi<DataFiltersState>) => string[];
  updatePinnedVisualizationSpec: (
    key: string,
    newSpec: UDIGrammar,
    sourceFields: Record<string, string[]> | null,
  ) => void;
}

let counter = 0;

function generateId(): string {
  return `udi_${Date.now()}_${++counter}`;
}

function structuredClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Pick the `name` off either a single source or the first of an array. */
function getSpecSourceName(spec: UDIGrammar): string | undefined {
  const src = spec.source as SpecSourceLike | SpecSourceLike[] | undefined;
  if (!src) return undefined;
  return Array.isArray(src) ? src[0]?.name : src.name;
}

// Minimal shapes the spec-walking code relies on. The canonical UDIGrammar
// tree is a discriminated union of mark-specific layer types; these aliases
// model only the fields this file reads/writes without losing type safety.
interface SpecMappingLike {
  field: string;
  title?: string;
  type?: string;
  encoding?: string;
}

interface SpecRepresentationLike {
  mark?: string;
  mapping?: SpecMappingLike | SpecMappingLike[];
  select?: unknown;
}

interface SpecSourceLike {
  name?: string;
}

interface InteractiveSpec extends UDIGrammar {
  config?: {
    hideActions?: boolean;
  };
}

export function injectInteractivity(
  spec: UDIGrammar,
  id: string,
  sourceFields: Record<string, string[]> | null,
): InteractiveSpec {
  const sourceData = Array.isArray(spec.source)
    ? (spec.source as SpecSourceLike[])
    : [spec.source as SpecSourceLike];
  const sourceName = sourceData[0]?.name ?? 'unknown_source';
  const interactiveSpec: InteractiveSpec = structuredClone(spec);
  let firstRepresentation = interactiveSpec.representation as
    | SpecRepresentationLike
    | SpecRepresentationLike[]
    | undefined;
  if (Array.isArray(firstRepresentation)) {
    firstRepresentation = firstRepresentation[0];
  }
  if (!firstRepresentation) return interactiveSpec;
  if (firstRepresentation.mark === 'row') return interactiveSpec;

  const rawMapping = firstRepresentation.mapping;
  const mappingList: SpecMappingLike[] = Array.isArray(rawMapping)
    ? rawMapping
    : rawMapping
      ? [rawMapping]
      : [];

  const resolveField = (mapping: SpecMappingLike): string | null => {
    const fields = sourceFields?.[sourceName];
    if (!fields) return mapping.field;
    if (fields.includes(mapping.field)) return mapping.field;
    if (mapping.title && fields.includes(mapping.title)) return mapping.title;
    return null;
  };

  const intervalDimensions = mappingList.filter(
    (mapping) =>
      mapping.type === 'quantitative' &&
      (mapping.encoding === 'x' || mapping.encoding === 'y') &&
      resolveField(mapping) !== null,
  );

  const intervalSelectionOn = intervalDimensions
    .map((m) => m.encoding ?? '')
    .sort()
    .join('');

  const intervalFields = intervalDimensions
    .sort((a, b) => (a.encoding ?? '').localeCompare(b.encoding ?? ''))
    .map((m) => resolveField(m))
    .filter((f): f is string => f !== null);

  if (intervalSelectionOn.length > 0) {
    firstRepresentation.select = {
      name: id,
      source: sourceName,
      how: { type: 'interval', on: intervalSelectionOn, field: intervalFields },
    };
  } else {
    const categoricalDimensions = mappingList.filter(
      (mapping) =>
        mapping.type !== 'quantitative' &&
        (mapping.encoding === 'x' || mapping.encoding === 'y' || mapping.encoding === 'color') &&
        resolveField(mapping) !== null,
    );
    firstRepresentation.select = {
      name: id,
      source: sourceName,
      how: { type: 'point' },
      fields: categoricalDimensions.map((m) => resolveField(m)!),
    };
  }

  console.log({ interactiveSpec });
  interactiveSpec.config = { hideActions: true };
  return interactiveSpec;
}

function getRepresentedFields(spec: UDIGrammar): string[] {
  if (!spec.representation) return [];
  const fields = new Set<string>();
  const representations = Array.isArray(spec.representation)
    ? (spec.representation as SpecRepresentationLike[])
    : [spec.representation as SpecRepresentationLike];
  for (const representation of representations) {
    const rawMapping = representation.mapping;
    const mappings: SpecMappingLike[] = Array.isArray(rawMapping)
      ? rawMapping
      : rawMapping
        ? [rawMapping]
        : [];
    for (const mapping of mappings) {
      if (mapping && 'field' in mapping && mapping.field) {
        fields.add(mapping.field);
      }
    }
  }
  return Array.from(fields);
}

export function createDashboardStore() {
  return createStore<DashboardState>()((set, get) => ({
    pinnedVisualizations: new Map(),
    filterAllNullValues: true,
    expandedVisualizations: new Set(),
    tableViewKeys: new Set(),
    hoveredVisualizationIndex: null,

    pinKey: (messageIndex, toolCallIndex) => `${messageIndex}-${toolCallIndex}`,

    pinVisualization: (index, toolCallIndex, spec, userPrompt, sourceFields, title) => {
      const uuid = generateId();
      const interactiveSpec = injectInteractivity(spec, uuid, sourceFields);
      const key = get().pinKey(index, toolCallIndex);
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        next.set(key, { index, toolCallIndex, spec, interactiveSpec, userPrompt, title, uuid });
        return { pinnedVisualizations: next };
      });
    },

    pinVisualizationBatch: (items) => {
      if (items.length === 0) return;
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        for (const { index, toolCallIndex, spec, userPrompt, sourceFields, title } of items) {
          const uuid = generateId();
          const interactiveSpec = injectInteractivity(spec, uuid, sourceFields);
          const key = `${index}-${toolCallIndex}`;
          next.set(key, { index, toolCallIndex, spec, interactiveSpec, userPrompt, title, uuid });
        }
        return { pinnedVisualizations: next };
      });
    },

    unpinVisualization: (key, memoryBankStore) => {
      const viz = get().pinnedVisualizations.get(key);
      if (viz && memoryBankStore) {
        memoryBankStore.getState().addToMemoryBank(key, viz);
      }
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        next.delete(key);
        const nextExpanded = new Set(state.expandedVisualizations);
        nextExpanded.delete(key);
        return { pinnedVisualizations: next, expandedVisualizations: nextExpanded };
      });
    },

    restoreFromMemoryBank: (key, memoryBankStore) => {
      const viz = memoryBankStore.getState().closedVisualizations.get(key);
      if (!viz) return;
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        next.set(key, viz);
        return { pinnedVisualizations: next };
      });
      memoryBankStore.getState().removeFromMemoryBank(key);
    },

    isPinned: (key) => get().pinnedVisualizations.has(key),

    clearAllVisualizations: () =>
      set({
        pinnedVisualizations: new Map(),
        expandedVisualizations: new Set(),
        tableViewKeys: new Set(),
      }),

    setFilterAllNullValues: (value) => set({ filterAllNullValues: value }),

    toggleExpanded: (key) => {
      set((state) => {
        const next = new Set(state.expandedVisualizations);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { expandedVisualizations: next };
      });
    },

    isExpanded: (key) => get().expandedVisualizations.has(key),

    toggleTableView: (key) => {
      set((state) => {
        const next = new Set(state.tableViewKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { tableViewKeys: next };
      });
    },

    isTableView: (key) => get().tableViewKeys.has(key),

    setHoveredVisualizationIndex: (key) => set({ hoveredVisualizationIndex: key }),

    isHovered: (key) => get().hoveredVisualizationIndex === key,

    getFilterIds: (dataFiltersStore) => {
      const vizFilterIDs = Array.from(get().pinnedVisualizations.values()).map((v) => v.uuid);
      const validSelections = dataFiltersStore.getState().getValidDataSelections({
        isValidIntervalFilter: () => ({ isValid: 'yes' }),
        isValidPointFilter: () => ({ isValid: 'yes' }),
      });
      const externalIds = Object.keys(validSelections);
      const ids = Array.from(new Set([...vizFilterIDs, ...externalIds]));
      ids.sort();
      return ids;
    },

    getNamedFilters: (filterIdList, currentSourceName, dataFiltersStore, dataPackageStore) => {
      const state = get();
      const uuidToSource = new Map<string, string>();
      for (const v of state.pinnedVisualizations.values()) {
        const sourceName = getSpecSourceName(v.interactiveSpec);
        if (v.uuid && sourceName) uuidToSource.set(v.uuid, sourceName);
      }

      const dpState = dataPackageStore.getState();
      const dfState = dataFiltersStore.getState();
      const validSelections = dfState.getValidDataSelections({
        isValidIntervalFilter: dpState.isValidIntervalFilter,
        isValidPointFilter: dpState.isValidPointFilter,
      });

      const getSourceName = (id: string) => {
        return uuidToSource.get(id) ?? validSelections[id]?.dataSourceKey ?? null;
      };

      return filterIdList
        .map((id: string): object | null => {
          const originSourceName = getSourceName(id);
          if (!originSourceName) return null;
          if (originSourceName !== currentSourceName) {
            const er: EntityRelationship | null = dpState.getEntityRelationship(
              originSourceName,
              currentSourceName,
            );
            if (!er) return null;
            return {
              filter: {
                name: id,
                source: originSourceName,
                entityRelationship: er,
              },
            };
          }
          return { filter: { name: id } };
        })
        .filter((f): f is object => f !== null);
    },

    updateSpecFilters: (dataFiltersStore, dataPackageStore) => {
      const state = get();
      const dpState = dataPackageStore.getState();
      const filterIdList = (() => {
        const vizFilterIDs = Array.from(state.pinnedVisualizations.values()).map((v) => v.uuid);
        const validSelections = dataFiltersStore.getState().getValidDataSelections({
          isValidIntervalFilter: dpState.isValidIntervalFilter,
          isValidPointFilter: dpState.isValidPointFilter,
        });
        const externalIds = Object.keys(validSelections);
        return Array.from(new Set([...vizFilterIDs, ...externalIds])).sort();
      })();

      let changed = false;
      const next = new Map(state.pinnedVisualizations);

      for (const [key, viz] of next) {
        const currentSourceName = getSpecSourceName(viz.interactiveSpec);

        // Include the viz's own brush UUID so the source chart also filters
        // its own data. Previously excluded to avoid re-render side effects,
        // but those are now handled upstream:
        //   - deep-clone of props.spec in UDIVis.vue render() prevents spec
        //     mutations from leaking back to React's specKey (no remount)
        //   - save/restore of per-channel signals in VegaLite.vue
        //     updateVegaChart preserves the brush across data updates
        //   - re-clone of parsedSpec at the start of buildVisualization
        //     prevents stale domain mutations from persisting across builds
        const newFilters = state.getNamedFilters(
          filterIdList,
          currentSourceName ?? 'unknown_source',
          dataFiltersStore,
          dataPackageStore,
        );
        const baseTrans = structuredClone(viz.spec.transformation ?? []) as object[];
        const nullFilters = state.filterAllNullValues
          ? getRepresentedFields(viz.spec).map((field) => ({ filter: `d['${field}'] != null` }))
          : [];

        const newTransformation = [
          ...newFilters,
          ...baseTrans,
          ...nullFilters,
        ] as DataTransformation[];

        if (
          JSON.stringify(viz.interactiveSpec.transformation) !== JSON.stringify(newTransformation)
        ) {
          const updatedSpec = structuredClone(viz.interactiveSpec) as UDIGrammar & {
            transformation?: object[];
          };
          updatedSpec.transformation = newTransformation;
          next.set(key, { ...viz, interactiveSpec: updatedSpec });
          changed = true;
        }
      }

      if (changed) set({ pinnedVisualizations: next });
    },

    updatePinnedVisualizationSpec: (key, newSpec, sourceFields) => {
      const viz = get().pinnedVisualizations.get(key);
      if (!viz) return;
      const interactiveSpec = injectInteractivity(newSpec, viz.uuid, sourceFields);
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        next.set(key, { ...viz, spec: newSpec, interactiveSpec });
        return { pinnedVisualizations: next };
      });
    },
  }));
}

// --- Pure helper functions for spec extraction ---

export function normalizeToolCalls(message: Message) {
  if (!message.tool_calls) return [];
  return message.tool_calls.map((call, index) => {
    const normalized = call.function
      ? { name: call.function.name, arguments: call.function.arguments }
      : { name: call.name!, arguments: call.arguments! };
    return { ...normalized, originalIndex: index };
  });
}

export function parseSpecFromToolCall(toolCall: {
  name: string;
  arguments: Record<string, unknown>;
}): object | null {
  const specString = toolCall.arguments?.spec;
  if (!specString) return null;
  if (typeof specString === 'string') {
    try {
      return JSON.parse(specString);
    } catch {
      return null;
    }
  }
  return null;
}

export function extractAllUdiSpecsFromMessage(message: Message): ExtractedSpec[] {
  if (message.role !== 'assistant' || !message.tool_calls?.length) return [];
  const results: ExtractedSpec[] = [];
  for (const call of normalizeToolCalls(message)) {
    if (call.name !== 'RenderVisualization') continue;
    const spec = parseSpecFromToolCall(call);
    if (spec) {
      const title = call.arguments?.title;
      results.push({
        spec,
        toolCallIndex: call.originalIndex,
        title: typeof title === 'string' ? title : undefined,
      });
    }
  }
  return results;
}
