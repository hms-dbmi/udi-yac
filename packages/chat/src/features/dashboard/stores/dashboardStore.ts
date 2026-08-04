import { createStore, type StoreApi } from 'zustand/vanilla';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { Layout, LayoutItem } from 'react-grid-layout';
import type { Message, TemplateParamDescriptor, ToolCallMeta } from '@/types/messages';
import type { DataFiltersState } from './dataFiltersStore';
import type { DataPackageState } from '@/features/data-package';
import type { MemoryBankState } from './memoryBankStore';
import type { EntityRelationship } from '@/types/dataPackage';
import type { DataTransformation } from 'udi-toolkit';
import {
  DEFAULT_CARD_H,
  DEFAULT_CARD_W,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROW_HEIGHT_PX,
  MIN_CARD_H,
  MIN_CARD_W,
  clampGridCols,
  clampGridRowHeight,
  gridColsForWidth,
} from '../utils/gridDefaults';
import {
  layoutItemsEqual,
  packAllRowMajor,
  packRowMajor,
  repackRowMajor,
} from '../utils/gridPacking';
import { computeInitialCardHeight } from '../utils/initialCardSize';

export interface ActiveVisualization {
  index: number;
  toolCallIndex: number;
  spec: UDIGrammar;
  interactiveSpec: UDIGrammar;
  userPrompt: string;
  title?: string;
  uuid: string;
  /** Present when the agent built this spec from a template (see below). */
  template?: TemplateProvenance;
}

/**
 * How a generated spec came to be: the template and the bindings it was resolved
 * with, plus the parameters the agent will accept a re-binding for.
 *
 * Carrying this is what lets a tweak re-resolve the template instead of rewriting
 * the finished spec — the only approach that stays correct when a binding is
 * referenced from transformations as well as encodings. `toolArgs` is kept
 * current as the user tweaks, so successive changes compose from the last
 * accepted set rather than from the original render.
 */
export interface TemplateProvenance {
  tool: string;
  toolArgs: Record<string, string>;
  params: TemplateParamDescriptor[];
}

export interface ExtractedSpec {
  spec: object;
  toolCallIndex: number;
  title?: string;
  template?: TemplateProvenance;
}

export interface DashboardLayout {
  items: Layout;
}

/**
 * v1 layout shape — kept exported as a type so the serialization parser can
 * validate legacy session-export files and migrate them via `repackRowMajor`.
 */
export interface DashboardLayoutV1 {
  columns: Array<{ id: string; cardKeys: string[]; cardSizes: Record<string, number> }>;
  columnSizes: Record<string, number>;
}

export interface DashboardExportVisualization {
  key: string;
  uuid: string;
  index: number;
  toolCallIndex: number;
  userPrompt: string;
  title?: string;
  spec: UDIGrammar;
  /** Kept so a restored dashboard is as tweakable as a live one. */
  template?: TemplateProvenance;
}

export interface DashboardExport {
  visualizations: DashboardExportVisualization[];
  layout: DashboardLayout;
}

export interface DashboardState {
  activeVisualizations: Map<string, ActiveVisualization>;
  layout: DashboardLayout;
  gridCols: number;
  gridRowHeight: number;
  containerWidth: number;
  filterAllNullValues: boolean;
  tableViewKeys: Set<string>;
  // Linked-hover state, one field per direction so each stays unambiguous:
  // `hoveredVisualizationIndex` = the hovered card's vizKey (drives the chat
  // message + matching accordion-item highlight/scroll); `hoveredMessageVizKey`
  // = the vizKey the chat is pointing at — a single-viz message's card, or a
  // specific accordion item in a multi-viz message — drives that card's
  // highlight/scroll.
  hoveredVisualizationIndex: string | null;
  hoveredMessageVizKey: string | null;
  vizKey: (messageIndex: number, toolCallIndex: number) => string;
  addActiveVisualization: (
    index: number,
    toolCallIndex: number,
    spec: UDIGrammar,
    userPrompt: string,
    sourceFields: Record<string, string[]> | null,
    title?: string,
    template?: TemplateProvenance,
  ) => void;
  addActiveVisualizationBatch: (
    items: Array<{
      index: number;
      toolCallIndex: number;
      spec: UDIGrammar;
      userPrompt: string;
      sourceFields: Record<string, string[]> | null;
      title?: string;
      template?: TemplateProvenance;
    }>,
    dataPackageStore?: StoreApi<DataPackageState>,
  ) => void;
  closeVisualization: (key: string, memoryBankStore?: StoreApi<MemoryBankState>) => void;
  restoreFromMemoryBank: (
    key: string,
    memoryBankStore: StoreApi<MemoryBankState>,
    dataPackageStore?: StoreApi<DataPackageState>,
  ) => void;
  isActive: (key: string) => boolean;
  clearAllVisualizations: () => void;
  setFilterAllNullValues: (value: boolean) => void;
  toggleTableView: (key: string) => void;
  isTableView: (key: string) => boolean;
  setHoveredVisualizationIndex: (key: string | null) => void;
  isHovered: (key: string) => boolean;
  setHoveredMessageVizKey: (key: string | null) => void;
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
  updateActiveVisualizationSpec: (
    key: string,
    newSpec: UDIGrammar,
    sourceFields: Record<string, string[]> | null,
  ) => void;
  applyTemplateRebind: (
    key: string,
    newSpec: UDIGrammar,
    toolArgs: Record<string, string>,
    params: TemplateParamDescriptor[] | undefined,
    sourceFields: Record<string, string[]> | null,
  ) => void;
  clearTemplateProvenance: (key: string) => void;
  setLayoutItems: (items: Layout) => void;
  setGridCols: (cols: number) => void;
  setGridRowHeight: (px: number) => void;
  setContainerWidth: (px: number) => void;
  repackLayout: (dataPackageStore?: StoreApi<DataPackageState>) => void;
  resetLayout: (dataPackageStore?: StoreApi<DataPackageState>) => void;
  exportDashboard: () => DashboardExport;
  importDashboard: (
    payload: DashboardExport,
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

function emptyLayout(): DashboardLayout {
  return { items: [] };
}

function newDefaultItem(key: string): LayoutItem {
  return {
    i: key,
    x: 0,
    y: 0,
    w: DEFAULT_CARD_W,
    h: DEFAULT_CARD_H,
    minW: MIN_CARD_W,
    minH: MIN_CARD_H,
  };
}

function pruneItems(items: Layout, knownKeys: Set<string>): Layout {
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const it of items) {
    if (!knownKeys.has(it.i) || seen.has(it.i)) continue;
    seen.add(it.i);
    out.push(it);
  }
  return out;
}

function insertItemRowMajor(
  layout: DashboardLayout,
  item: LayoutItem,
  cols: number,
): DashboardLayout {
  if (layout.items.some((it) => it.i === item.i)) return layout;
  const items = repackRowMajor(layout.items, item, cols);
  return { items };
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
    SpecRepresentationLike | SpecRepresentationLike[] | undefined;
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

/**
 * Fields that **every** layer encodes.
 *
 * Used to drop rows with missing values. The filters apply to the one dataset all
 * layers share, so a field only qualifies if no layer could draw the row anyway.
 * A layered spec routinely nulls a field out on purpose — that is how an
 * annotation layer picks the rows it marks — and filtering on a field encoded by
 * only some layers would delete those rows from the layers that do want them,
 * taking the data with it. Vega-Lite already drops invalid values per layer, so
 * what this pass skips is still handled downstream.
 *
 * For a single-layer spec (the common case) this is every encoded field.
 */
function getFieldsInEveryLayer(spec: UDIGrammar): string[] {
  if (!spec.representation) return [];
  const representations = Array.isArray(spec.representation)
    ? (spec.representation as SpecRepresentationLike[])
    : [spec.representation as SpecRepresentationLike];

  const perLayer: Set<string>[] = representations.map((representation) => {
    const rawMapping = representation.mapping;
    const mappings: SpecMappingLike[] = Array.isArray(rawMapping)
      ? rawMapping
      : rawMapping
        ? [rawMapping]
        : [];
    const fields = new Set<string>();
    for (const mapping of mappings) {
      if (mapping && 'field' in mapping && mapping.field) {
        fields.add(mapping.field);
      }
    }
    return fields;
  });

  const [first, ...rest] = perLayer;
  if (!first) return [];
  return [...first].filter((field) => rest.every((layer) => layer.has(field)));
}

export function createDashboardStore() {
  return createStore<DashboardState>()((set, get) => ({
    activeVisualizations: new Map(),
    layout: emptyLayout(),
    gridCols: DEFAULT_GRID_COLS,
    gridRowHeight: DEFAULT_GRID_ROW_HEIGHT_PX,
    containerWidth: 0,
    filterAllNullValues: true,
    tableViewKeys: new Set(),
    hoveredVisualizationIndex: null,
    hoveredMessageVizKey: null,

    vizKey: (messageIndex, toolCallIndex) => `${messageIndex}-${toolCallIndex}`,

    addActiveVisualization: (
      index,
      toolCallIndex,
      spec,
      userPrompt,
      sourceFields,
      title,
      template,
    ) => {
      const uuid = generateId();
      const interactiveSpec = injectInteractivity(spec, uuid, sourceFields);
      const key = get().vizKey(index, toolCallIndex);
      set((state) => {
        const next = new Map(state.activeVisualizations);
        next.set(key, {
          index,
          toolCallIndex,
          spec,
          interactiveSpec,
          userPrompt,
          title,
          uuid,
          template,
        });
        return {
          activeVisualizations: next,
          layout: insertItemRowMajor(state.layout, newDefaultItem(key), state.gridCols),
        };
      });
    },

    addActiveVisualizationBatch: (items, dataPackageStore) => {
      if (items.length === 0) return;
      set((state) => {
        const next = new Map(state.activeVisualizations);
        const newItems: LayoutItem[] = [];
        // Domain lookup is only available when the caller passes the
        // dataPackageStore (UDIChat does; tests typically don't). Without
        // it we just keep DEFAULT_CARD_H. With it, computeInitialCardHeight
        // returns a row count sized to fit categorical Y mappings, so a
        // "donors by race" chart lands tall enough to show every category
        // instead of cramped at the default height.
        const getDomainForField = dataPackageStore?.getState().getDomainForField;
        for (const {
          index,
          toolCallIndex,
          spec,
          userPrompt,
          sourceFields,
          title,
          template,
        } of items) {
          const uuid = generateId();
          const interactiveSpec = injectInteractivity(spec, uuid, sourceFields);
          const key = `${index}-${toolCallIndex}`;
          if (state.activeVisualizations.has(key)) continue;
          next.set(key, {
            index,
            toolCallIndex,
            spec,
            interactiveSpec,
            userPrompt,
            title,
            uuid,
            template,
          });
          const h = getDomainForField
            ? computeInitialCardHeight(spec, getDomainForField, state.gridRowHeight)
            : DEFAULT_CARD_H;
          newItems.push({ ...newDefaultItem(key), h });
        }
        if (newItems.length === 0) return { activeVisualizations: next };
        // Single repack: prepend the whole batch (in arrival order) ahead of
        // existing items sorted row-major. This distributes the batch across
        // the available columns left-to-right, then wraps — e.g. with 3 cols
        // and 4 new items, col0 gets 2 (item0 + item3 wrap), cols 1+2 get 1.
        const newKeys = new Set(newItems.map((it) => it.i));
        const existingOrdered = [...state.layout.items]
          .filter((it) => !newKeys.has(it.i))
          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
        const combined = [...newItems, ...existingOrdered];
        return {
          activeVisualizations: next,
          layout: { items: packAllRowMajor(combined, state.gridCols) },
        };
      });
    },

    closeVisualization: (key, memoryBankStore) => {
      const viz = get().activeVisualizations.get(key);
      if (viz && memoryBankStore) {
        memoryBankStore.getState().addToMemoryBank(key, viz);
      }
      set((state) => {
        const next = new Map(state.activeVisualizations);
        next.delete(key);
        // Re-pack so the removed card leaves no gap: later cards pull up/left to
        // fill it, keeping the grid a contiguous ordered list.
        const remaining = state.layout.items.filter((it) => it.i !== key);
        return {
          activeVisualizations: next,
          layout: { items: packRowMajor(remaining, state.gridCols) },
        };
      });
    },

    restoreFromMemoryBank: (key, memoryBankStore, dataPackageStore) => {
      const viz = memoryBankStore.getState().closedVisualizations.get(key);
      if (!viz) return;
      set((state) => {
        const next = new Map(state.activeVisualizations);
        next.set(key, viz);
        // Recompute height when restoring — closing a card discards its
        // last resized height, so we'd otherwise drop back to
        // DEFAULT_CARD_H on restore. Re-running the category-aware
        // estimator means a "donor by organ" chart comes back tall
        // enough for all 15 organs just like its initial add did.
        const getDomainForField = dataPackageStore?.getState().getDomainForField;
        const h = getDomainForField
          ? computeInitialCardHeight(viz.spec, getDomainForField, state.gridRowHeight)
          : DEFAULT_CARD_H;
        const item = { ...newDefaultItem(key), h };
        return {
          activeVisualizations: next,
          layout: insertItemRowMajor(state.layout, item, state.gridCols),
        };
      });
      memoryBankStore.getState().removeFromMemoryBank(key);
    },

    isActive: (key) => get().activeVisualizations.has(key),

    clearAllVisualizations: () =>
      set({
        activeVisualizations: new Map(),
        tableViewKeys: new Set(),
        layout: emptyLayout(),
      }),

    setFilterAllNullValues: (value) => set({ filterAllNullValues: value }),

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

    setHoveredMessageVizKey: (key) => set({ hoveredMessageVizKey: key }),

    getFilterIds: (dataFiltersStore) => {
      const vizFilterIDs = Array.from(get().activeVisualizations.values()).map((v) => v.uuid);
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
      for (const v of state.activeVisualizations.values()) {
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
        const vizFilterIDs = Array.from(state.activeVisualizations.values()).map((v) => v.uuid);
        const validSelections = dataFiltersStore.getState().getValidDataSelections({
          isValidIntervalFilter: dpState.isValidIntervalFilter,
          isValidPointFilter: dpState.isValidPointFilter,
        });
        const externalIds = Object.keys(validSelections);
        return Array.from(new Set([...vizFilterIDs, ...externalIds])).sort();
      })();

      let changed = false;
      const next = new Map(state.activeVisualizations);

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
        // Structured expression AST, not the legacy raw string form — the
        // remote query backend rejects raw Arquero strings by design.
        const nullFilters = state.filterAllNullValues
          ? getFieldsInEveryLayer(viz.spec).map((field) => ({
              filter: { op: '!=', left: { field }, right: { literal: null } },
            }))
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

      if (changed) set({ activeVisualizations: next });
    },

    updateActiveVisualizationSpec: (key, newSpec, sourceFields) => {
      const viz = get().activeVisualizations.get(key);
      if (!viz) return;
      const interactiveSpec = injectInteractivity(newSpec, viz.uuid, sourceFields);
      set((state) => {
        const next = new Map(state.activeVisualizations);
        next.set(key, { ...viz, spec: newSpec, interactiveSpec });
        return { activeVisualizations: next };
      });
    },

    /**
     * Replace a chart with a freshly instantiated one from the same template.
     *
     * Keeps the viz's uuid, so a live brush and every cross-filter keyed on it
     * survive the swap, and merges the accepted bindings so the next tweak builds
     * on this one. `params` comes back from the server and replaces the stored
     * descriptors, which is what makes a template whose parameter set has changed
     * self-correct on first use.
     */
    applyTemplateRebind: (key, newSpec, toolArgs, params, sourceFields) => {
      const viz = get().activeVisualizations.get(key);
      if (!viz || !viz.template) return;
      const interactiveSpec = injectInteractivity(newSpec, viz.uuid, sourceFields);
      set((state) => {
        const next = new Map(state.activeVisualizations);
        next.set(key, {
          ...viz,
          spec: newSpec,
          interactiveSpec,
          template: {
            tool: viz.template!.tool,
            toolArgs: { ...viz.template!.toolArgs, ...toolArgs },
            params: params ?? viz.template!.params,
          },
        });
        return { activeVisualizations: next };
      });
    },

    /**
     * Forget that a chart came from a template — used when the agent no longer
     * recognises it, so the panel stops offering a control that cannot work.
     */
    clearTemplateProvenance: (key) => {
      const viz = get().activeVisualizations.get(key);
      if (!viz || !viz.template) return;
      set((state) => {
        const next = new Map(state.activeVisualizations);
        const { template: _dropped, ...rest } = viz;
        next.set(key, rest);
        return { activeVisualizations: next };
      });
    },

    setLayoutItems: (items) => {
      const state = get();
      const knownKeys = new Set(state.activeVisualizations.keys());

      // RGL emits `onLayoutChange` during drag/resize ticks with its own
      // internal snapshot of the layout. If a new visualization is added
      // mid-interaction (e.g. AI returns a new chart while the user is
      // dragging), RGL's snapshot may not include it — the incoming layout
      // would then be missing that item, and a plain `pruneItems + set`
      // would silently drop it from `layout.items` even though it lives
      // in `activeVisualizations`.
      //
      // Merge instead of replace: walk the existing layout in order,
      // adopting the incoming position for items present in the payload,
      // keeping the prior position for items that are still active but
      // absent. Anything in the incoming layout that isn't in the prior
      // layout (rare — addActiveVisualization* already seeds a position)
      // gets appended.
      const incomingByKey = new Map<string, LayoutItem>();
      for (const it of items) {
        if (knownKeys.has(it.i)) incomingByKey.set(it.i, it);
      }
      const merged: LayoutItem[] = [];
      const handled = new Set<string>();
      for (const stateItem of state.layout.items) {
        if (!knownKeys.has(stateItem.i)) continue;
        merged.push(incomingByKey.get(stateItem.i) ?? stateItem);
        handled.add(stateItem.i);
      }
      for (const it of items) {
        if (knownKeys.has(it.i) && !handled.has(it.i)) merged.push(it);
      }

      // Skip the update if (i, x, y, w, h) for every item matches what's
      // already in the store. Without this guard, RGL's compactor produces
      // a new array reference on every render — and our `set()` would feed
      // a new layout prop back into RGL, which then runs compactor again,
      // fires onLayoutChange again, looping until React aborts with
      // "Maximum update depth exceeded" on viewport resize.
      if (layoutItemsEqual(state.layout.items, merged)) return;
      set({ layout: { items: merged } });
    },

    setGridCols: (cols) => {
      const safe = clampGridCols(cols);
      const current = get();
      if (current.gridCols === safe) return;
      // Re-pack items into the new column count in row-major reading order
      // so existing cards with x+w > newCols don't overflow the grid.
      const sorted = [...current.layout.items].sort((a, b) =>
        a.y === b.y ? a.x - b.x : a.y - b.y,
      );
      const repacked = packAllRowMajor(sorted, safe);
      if (layoutItemsEqual(current.layout.items, repacked)) {
        set({ gridCols: safe });
        return;
      }
      set({ gridCols: safe, layout: { items: repacked } });
    },

    setGridRowHeight: (px) => {
      const safe = clampGridRowHeight(px);
      if (get().gridRowHeight === safe) return;
      set({ gridRowHeight: safe });
    },

    setContainerWidth: (px) => {
      if (get().containerWidth === px) return;
      set({ containerWidth: px });
    },

    repackLayout: (dataPackageStore) => {
      set((state) => {
        if (state.layout.items.length === 0) return state;
        const cols = state.gridCols;
        const getDomainForField = dataPackageStore?.getState().getDomainForField;
        const ordered = state.layout.items.map((it) => {
          const viz = state.activeVisualizations.get(it.i);
          const h =
            viz && getDomainForField
              ? computeInitialCardHeight(viz.spec, getDomainForField, state.gridRowHeight)
              : DEFAULT_CARD_H;
          return {
            ...it,
            w: DEFAULT_CARD_W,
            h,
            minW: MIN_CARD_W,
            minH: MIN_CARD_H,
          };
        });
        return { layout: { items: packAllRowMajor(ordered, cols) } };
      });
    },

    resetLayout: (dataPackageStore) => {
      // Reset the grid controls to their defaults: column count re-derived from
      // the current view width (same rule the responsive effect uses) and row
      // height back to the default. Then repack the cards against the reset grid.
      set((state) => ({
        gridCols: gridColsForWidth(state.containerWidth),
        gridRowHeight: DEFAULT_GRID_ROW_HEIGHT_PX,
      }));
      get().repackLayout(dataPackageStore);
    },

    exportDashboard: () => {
      const state = get();
      const visualizations: DashboardExportVisualization[] = [];
      for (const [key, viz] of state.activeVisualizations) {
        visualizations.push({
          key,
          uuid: viz.uuid,
          index: viz.index,
          toolCallIndex: viz.toolCallIndex,
          userPrompt: viz.userPrompt,
          title: viz.title,
          spec: structuredClone(viz.spec),
          template: viz.template ? structuredClone(viz.template) : undefined,
        });
      }
      return {
        visualizations,
        layout: { items: state.layout.items.map((it) => ({ ...it })) },
      };
    },

    importDashboard: (payload, sourceFields) => {
      const next = new Map<string, ActiveVisualization>();
      for (const v of payload.visualizations) {
        const uuid = v.uuid || generateId();
        const interactiveSpec = injectInteractivity(v.spec, uuid, sourceFields);
        next.set(v.key, {
          index: v.index,
          toolCallIndex: v.toolCallIndex,
          spec: v.spec,
          interactiveSpec,
          userPrompt: v.userPrompt,
          title: v.title,
          uuid,
          template: v.template,
        });
      }
      const knownKeys = new Set(next.keys());
      const cols = get().gridCols;

      const provided = pruneItems(payload.layout.items, knownKeys);
      const placedKeys = new Set(provided.map((it) => it.i));
      const orphanItems: LayoutItem[] = [];
      for (const k of knownKeys) {
        if (!placedKeys.has(k)) orphanItems.push(newDefaultItem(k));
      }
      // A v1 import (or any single-column export) lands as items all at x=0
      // with w=1 — re-pack against the current viewport so cards spread out
      // horizontally instead of sitting in one tall stack. A user-customized
      // v2 export with intentional positions is preserved verbatim.
      const looksStacked = provided.length > 1 && provided.every((it) => it.x === 0 && it.w <= 1);
      const shouldRepack = orphanItems.length > 0 || looksStacked;
      const combined = [...provided, ...orphanItems];
      const items = shouldRepack ? packAllRowMajor(combined, cols) : combined;
      set({
        activeVisualizations: next,
        tableViewKeys: new Set(),
        layout: { items },
      });
    },
  }));
}

// --- Pure helper functions for spec extraction ---

export function normalizeToolCalls(message: Message) {
  if (!message.tool_calls) return [];
  return message.tool_calls.map((call, index) => {
    // `meta` rides along: it is the only record of which template produced a
    // spec, and the tweak panel needs it to re-bind rather than rewrite.
    const normalized = call.function
      ? {
          name: call.function.name,
          arguments: call.function.arguments,
          meta: call.function.meta,
        }
      : { name: call.name!, arguments: call.arguments!, meta: call.meta };
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

/**
 * Read template provenance off a tool call's `meta`, or nothing if it isn't
 * trustworthy.
 *
 * The agent already withholds `tweakable_params` when the spec it delivered is no
 * longer exactly its template's instantiation (a correction pass replaces it), so
 * this is a shape check on top of that decision — older agents send no `meta` at
 * all, and an imported session can carry anything.
 */
export function parseTemplateProvenance(
  meta: ToolCallMeta | undefined,
): TemplateProvenance | undefined {
  if (!meta) return undefined;
  const { tool_used: tool, tool_args: toolArgs, tweakable_params: params } = meta;
  if (typeof tool !== 'string' || tool.length === 0) return undefined;
  if (!toolArgs || typeof toolArgs !== 'object') return undefined;
  if (!Array.isArray(params) || params.length === 0) return undefined;
  const wellFormed = params.every(
    (p): p is TemplateParamDescriptor =>
      !!p &&
      typeof p === 'object' &&
      typeof p.param === 'string' &&
      typeof p.value === 'string' &&
      typeof p.label === 'string',
  );
  if (!wellFormed) return undefined;
  return { tool, toolArgs: toolArgs as Record<string, string>, params };
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
        template: parseTemplateProvenance(call.meta),
      });
    }
  }
  return results;
}
