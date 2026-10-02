import { createStore } from 'zustand/vanilla';
import type {
  DataSelection,
  DataSelections,
  RangeSelection,
  PointSelection,
} from 'udi-toolkit/react';
import type { Message, ToolCall } from '@/types/messages';
import type { ValidStatus } from '@/types/dataPackage';
import type { FilterDataArgs } from '@/features/tool-calls';
import { normalizePointValues } from '@/features/data-package';

export type { DataSelection, DataSelections };

export interface ExtractedFilter {
  args: FilterDataArgs;
  toolCallIndex: number;
}

interface ValidateFilterFn {
  isValidIntervalFilter: (entity: string, field: string) => ValidStatus;
  isValidPointFilter: (entity: string, field: string, values: unknown[]) => ValidStatus;
}

/**
 * Admit anything not definitively invalid.
 *
 * `unknown` means "can't verify" — a server-side package drops categorical
 * domains above 80 distinct values, so demanding `yes` silently discarded
 * perfectly good filters. Admission (syncFiltersFromMessages) and application
 * (getValidDataSelections) must use the SAME rule: loosen one without the
 * other and a filter renders a populated widget while filtering nothing.
 */
function isAdmissible(status: ValidStatus): boolean {
  return status.isValid !== 'no';
}

/** Where a filter came from: a FilterData tool call, a chart brush/click, or
 *  the embedding page's `filters` prop. */
export type FilterOrigin = 'chat' | 'chart' | 'host';

/**
 * A filter as the embedding page sees it (`filters` / `onFiltersChange`). An
 * empty value list (or `[]` range) is all-inclusive: the filter is in place but
 * drops nothing. `origin` is reported, and ignored on input.
 */
export interface UDIFilter extends DataSelection {
  id: string;
  origin?: FilterOrigin;
}

/** `dataSelections` key prefix for filters set through the `filters` prop. */
export const HOST_FILTER_PREFIX = 'host-filter-';

/** Keys of `dataSelections` that are filters in their own right (chat or host)
 *  rather than brush selections echoed back out of Pinia. */
export function isChatFilterKey(key: string): boolean {
  return key.startsWith('message-filter-') || key.startsWith(HOST_FILTER_PREFIX);
}

/**
 * Whether a selection currently constrains anything. A point field with every
 * value unchecked, or an interval field emptied to `[]`, is "present but
 * empty": the filter is still in place (its chip reads "All"), it just drops
 * nothing.
 */
export function selectionHasValue(selection: DataSelection): boolean {
  const sel = selection.selection;
  if (sel == null) return false;
  const values = Object.values(sel);
  if (values.length === 0) return false;
  return !values.every((v) => v == null || (Array.isArray(v) && v.length === 0));
}

/** Every field admissible — not only the first, which is all the LLM path ever
 *  produces but a host-supplied filter need not respect. */
export function isValidSelection(sel: DataSelection, validate: ValidateFilterFn): boolean {
  const entries = Object.entries(sel.selection ?? {});
  if (entries.length === 0) return false;
  return entries.every(([field, values]) =>
    isAdmissible(
      sel.type === 'interval'
        ? validate.isValidIntervalFilter(sel.dataSourceKey, field)
        : validate.isValidPointFilter(sel.dataSourceKey, field, values as unknown[]),
    ),
  );
}

export interface DataFiltersState {
  dataSelections: DataSelections;
  internalDataSelections: DataSelections;
  /**
   * Filters the user removed (chip gone, chat item collapsed), keyed by filter
   * id: the chat/host key, an interval brush's viz uuid, or `${uuid}::${field}`
   * for a point brush. A removed filter is also emptied, so it drops nothing;
   * the flag goes as soon as the filter holds a value again (a fresh brush).
   */
  removedFilters: Record<string, true>;
  /**
   * Where each brush filter sits in the chat: how many messages the
   * conversation held when it first got a value, keyed by brush filter id. Its
   * widget renders just before the message at that index, so it reads in the
   * order it happened. Kept across removal, so a restored brush stays put.
   */
  brushAnchors: Record<string, number>;
  /** The filter the pointer is on, and which side it is on: its chat widget
   *  highlights for a toolbar hover and its chip for a chat one, while the
   *  chart a brush came from highlights for either. */
  hoveredFilter: HoveredFilter | null;

  getValidDataSelections: (validate: ValidateFilterFn) => DataSelections;
  syncFiltersFromMessages: (messages: Message[], validate: ValidateFilterFn) => void;
  syncSelectionsBackToMessages: (messages: Message[]) => void;
  /** Mirror brush selections in. `messageCount` anchors each brush filter that
   *  gets its first value here (see `brushAnchors`). */
  updateInternalDataSelections: (newFilters: DataSelections, messageCount?: number) => void;
  /** Make a filter all-inclusive while keeping it in place. */
  clearFilter: (id: string) => void;
  /** Clear a filter and hide it; `restoreFilter` brings it back, cleared. */
  removeFilter: (id: string) => void;
  restoreFilter: (id: string) => void;
  /** Clear every filter, chat and brush alike. */
  clearAllFilters: () => void;
  /** Write an edit to a filter by id, wherever it lives. */
  setFilter: (id: string, selection: DataSelection) => void;
  /** Sync the `filters` prop in: upsert what changed since the last call,
   *  delete what the host dropped. */
  applyExternalFilters: (filters: UDIFilter[]) => void;
  resetFilters: () => void;
  setDataSelection: (key: string, selection: DataSelection) => void;
  setHoveredFilter: (hovered: HoveredFilter | null) => void;
}

export interface HoveredFilter {
  id: string;
  from: 'chat' | 'toolbar';
}

// --- Pure helper functions ---

function getToolCallName(toolCall: ToolCall): string {
  if (toolCall.function) return toolCall.function.name;
  return toolCall.name ?? '';
}

function getToolCallArgs(toolCall: ToolCall): Record<string, unknown> | undefined {
  if (toolCall.function) return toolCall.function.arguments;
  return toolCall.arguments;
}

export function messageFilterKeyWithToolCall(
  messageIndex: number,
  toolCallIndex: number,
  message?: Message,
): string {
  return message?.linkedVisFilterId ?? `message-filter-${messageIndex}-${toolCallIndex}`;
}

export function messageFilterKey(messageIndex: number, message?: Message): string {
  return messageFilterKeyWithToolCall(messageIndex, 0, message);
}

function messageIndexFromKey(filterKey: string): number | null {
  const match = filterKey.match(/message-filter-(\d+)/);
  return match ? parseInt(match[1]) : null;
}

export function containsFilterCall(message: Message): boolean {
  return message.tool_calls?.some((call) => getToolCallName(call) === 'FilterData') ?? false;
}

export function extractAllFilterSpecsFromMessage(message: Message): ExtractedFilter[] {
  if (!message.tool_calls?.length) return [];
  const results: ExtractedFilter[] = [];
  for (let i = 0; i < message.tool_calls.length; i++) {
    const call = message.tool_calls[i];
    if (getToolCallName(call) !== 'FilterData') continue;
    const args = getToolCallArgs(call);
    if (!args) continue;
    results.push({ args: normalizeFilterArgs(args), toolCallIndex: i });
  }
  return results;
}

export function extractFilterSpecFromMessage(message: Message): FilterDataArgs | null {
  const filters = extractAllFilterSpecsFromMessage(message);
  return filters.length > 0 ? filters[0].args : null;
}

/**
 * The args of one specific FilterData call in a message.
 *
 * `messageFilterKeyWithToolCall` already keys per tool call, so a widget for
 * tool call #1 must read #1's args — `extractFilterSpecFromMessage` always
 * returns the first, which made a two-filter message render the wrong field.
 */
export function filterSpecForToolCall(
  message: Message,
  toolCallIndex?: number,
): FilterDataArgs | null {
  const all = extractAllFilterSpecsFromMessage(message);
  if (all.length === 0) return null;
  // Matches messageFilterKey's own fallback to tool call 0.
  if (toolCallIndex == null) return all[0].args;
  return all.find((f) => f.toolCallIndex === toolCallIndex)?.args ?? null;
}

/** Normalize legacy `{ entity, field, min, max }` format into the current
 *  `{ entity, field, filter: { filterType, intervalRange, pointValues } }` shape. */
function normalizeFilterArgs(args: Record<string, unknown>): FilterDataArgs {
  const legacy = args as {
    title?: string;
    entity?: string;
    field?: string;
    min?: number;
    max?: number;
    filter?: { filterType?: string };
  };
  if (legacy.filter?.filterType) return args as unknown as FilterDataArgs;
  // Legacy format — min/max directly on args
  return {
    title: legacy.title ?? '',
    entity: legacy.entity ?? '',
    field: legacy.field ?? '',
    filter: {
      filterType: 'interval',
      intervalRange: { min: legacy.min ?? 0, max: legacy.max ?? 0 },
      pointValues: [],
    },
  };
}

export function generateFilterMessage(key: string, selection: DataSelection): Message | null {
  const sel = selection.selection;
  if (sel == null || Object.keys(sel).length === 0) return null;
  const tool_calls: ToolCall[] = Object.keys(sel).map((field) => {
    const value = sel[field];
    const filter =
      selection.type === 'interval'
        ? {
            filterType: 'interval' as const,
            intervalRange: {
              min: (value as RangeSelection[string])[0],
              max: (value as RangeSelection[string])[1],
            },
            pointValues: [] as string[],
          }
        : {
            filterType: 'point' as const,
            intervalRange: { min: 0, max: 0 },
            pointValues: value as PointSelection[string],
          };
    return {
      function: {
        name: 'FilterData',
        arguments: {
          entity: selection.dataSourceKey,
          field,
          filter,
        },
      },
    };
  });
  return {
    role: 'user' as const,
    content: '',
    linkedVisFilterId: key,
    tool_calls,
  };
}

// --- Store ---

/** Same shape the filter widgets' clear-all produces: fields kept, values dropped. */
function emptySelection(sel: DataSelection): DataSelection {
  if (!sel.selection) return sel;
  const fields = Object.keys(sel.selection);
  return {
    ...sel,
    selection: Object.fromEntries(fields.map((f) => [f, []])) as DataSelection['selection'],
  };
}

/** The removed-flag ids a brush write re-activates: a point brush's flags are
 *  per field (`${uuid}::${field}`), an interval brush's is the uuid. */
function brushIdsWithValue(uuid: string, sel: DataSelection): string[] {
  if (sel.type === 'interval') return selectionHasValue(sel) ? [uuid] : [];
  return Object.entries(sel.selection ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([field]) => `${uuid}::${field}`);
}

/** State update that empties filter `id` in whichever map holds it. */
function clearedState(
  s: DataFiltersState,
  id: string,
): Pick<DataFiltersState, 'removedFilters'> & Partial<DataFiltersState> {
  const removedFilters = { ...s.removedFilters };
  delete removedFilters[id];
  const chat = s.dataSelections[id];
  if (chat) {
    return { dataSelections: { ...s.dataSelections, [id]: emptySelection(chat) }, removedFilters };
  }
  // A point brush is split per field (`${uuid}::${field}`): empty only that
  // field, so its siblings keep filtering.
  const [uuid, field] = id.split('::');
  const brush = s.internalDataSelections[uuid];
  if (!brush?.selection) return { removedFilters };
  const next: DataSelection = field
    ? { ...brush, selection: { ...brush.selection, [field]: [] } as DataSelection['selection'] }
    : emptySelection(brush);
  return { internalDataSelections: { ...s.internalDataSelections, [uuid]: next }, removedFilters };
}

export function createDataFiltersStore() {
  // Last-applied JSON per host filter key, so a re-render passing the same
  // `filters` prop never clobbers the user's edits to those filters.
  const appliedHostFilters = new Map<string, string>();

  return createStore<DataFiltersState>()((set, get) => ({
    dataSelections: {},
    internalDataSelections: {},
    removedFilters: {},
    brushAnchors: {},
    hoveredFilter: null,

    getValidDataSelections: (validate: ValidateFilterFn): DataSelections => {
      const { dataSelections } = get();
      const valid: DataSelections = {};
      for (const [key, selection] of Object.entries(dataSelections)) {
        if (!isChatFilterKey(key) || !selectionHasValue(selection)) continue;
        if (isValidSelection(selection, validate)) valid[key] = selection;
      }
      return valid;
    },

    syncFiltersFromMessages: (messages: Message[], validate: ValidateFilterFn) => {
      const current = get().dataSelections;
      let changed = false;
      const next = { ...current };

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (!message || !containsFilterCall(message)) continue;
        const filters = extractAllFilterSpecsFromMessage(message);
        for (const { args: filterSpec, toolCallIndex } of filters) {
          const key = messageFilterKeyWithToolCall(i, toolCallIndex, message);
          if (key in next) continue;

          if (filterSpec.filter.filterType === 'interval') {
            if (!isAdmissible(validate.isValidIntervalFilter(filterSpec.entity, filterSpec.field)))
              continue;
            next[key] = {
              dataSourceKey: filterSpec.entity,
              type: 'interval',
              selection: {
                [filterSpec.field]: [
                  filterSpec.filter.intervalRange.min,
                  filterSpec.filter.intervalRange.max,
                ],
              },
            };
            changed = true;
          } else {
            if (
              !isAdmissible(
                validate.isValidPointFilter(
                  filterSpec.entity,
                  filterSpec.field,
                  filterSpec.filter.pointValues,
                ),
              )
            )
              continue;
            // A filter asked for without values ("filter by radiation type")
            // arrives as `[]`, or as `[""]` from older agents. Either way it is
            // present with nothing picked, so its widget lists the values to
            // choose from; a literal "" would filter to blanks and empty every
            // chart.
            next[key] = {
              dataSourceKey: filterSpec.entity,
              type: 'point',
              selection: {
                [filterSpec.field]: normalizePointValues(filterSpec.filter.pointValues),
              },
            };
            changed = true;
          }
        }
      }
      if (changed) set({ dataSelections: next });
    },

    syncSelectionsBackToMessages: (messages: Message[]) => {
      const { dataSelections } = get();
      for (const [selectionKey, selection] of Object.entries(dataSelections)) {
        const idx = messageIndexFromKey(selectionKey);
        if (idx === null) continue;
        const message = messages[idx];
        if (!message?.tool_calls) continue;
        for (const toolCall of message.tool_calls) {
          if (getToolCallName(toolCall) !== 'FilterData') continue;
          const args = getToolCallArgs(toolCall);
          if (!args || args.entity !== selection.dataSourceKey) continue;
          if (selection.type !== 'interval') continue;
          // Narrow the unknown-valued arg bag down to the shape FilterData
          // tool-call arguments are expected to have.
          const filterArg = args.filter as
            { intervalRange?: { min: number; max: number } } | undefined;
          if (!filterArg?.intervalRange) continue;
          for (const [selectionField, intervalSelection] of Object.entries(
            selection.selection ?? {},
          )) {
            if (args.field !== selectionField) continue;
            filterArg.intervalRange.min = intervalSelection[0] as number;
            filterArg.intervalRange.max = intervalSelection[1] as number;
          }
        }
      }
    },

    updateInternalDataSelections: (newFilters: DataSelections, messageCount?: number) => {
      const { internalDataSelections: current, removedFilters, brushAnchors } = get();
      const next = { ...current };
      const removed = { ...removedFilters };
      const anchors = { ...brushAnchors };
      let changed = false;
      for (const [key, newFilter] of Object.entries(newFilters)) {
        if (isChatFilterKey(key)) continue;
        if (JSON.stringify(next[key]) !== JSON.stringify(newFilter)) {
          next[key] = newFilter;
          for (const id of brushIdsWithValue(key, newFilter)) {
            delete removed[id];
            if (messageCount != null && !(id in anchors)) anchors[id] = messageCount;
          }
          changed = true;
        }
      }
      if (changed)
        set({ internalDataSelections: next, removedFilters: removed, brushAnchors: anchors });
    },

    // Clearing keeps the filter in place (its chip reads "All", its chat
    // widget stays expanded) with nothing checked: fields kept at `[]`, the
    // same shape the widgets' own clear-all produces. That holds for an
    // interval brush too — `{field: []}` filters nothing in either executor,
    // and DashboardCard remounts the chart to drop the drawn rectangle.
    clearFilter: (id: string) => set((s) => clearedState(s, id)),

    removeFilter: (id: string) =>
      set((s) => {
        const next = clearedState(s, id);
        return { ...next, removedFilters: { ...next.removedFilters, [id]: true } };
      }),

    restoreFilter: (id: string) =>
      set((s) => {
        if (!s.removedFilters[id]) return {};
        const removedFilters = { ...s.removedFilters };
        delete removedFilters[id];
        return { removedFilters };
      }),

    clearAllFilters: () =>
      set((s) => {
        const empty = (sels: DataSelections) =>
          Object.fromEntries(Object.entries(sels).map(([k, v]) => [k, emptySelection(v)]));
        return {
          dataSelections: empty(s.dataSelections),
          internalDataSelections: empty(s.internalDataSelections),
        };
      }),

    setFilter: (id: string, selection: DataSelection) => {
      const state = get();
      if (id in state.dataSelections) {
        state.setDataSelection(id, selection);
        return;
      }
      // Point brushes are split per field — merge this field's edit back into
      // the uuid's full multi-field selection so sibling fields survive.
      const [uuid, field] = id.split('::');
      let merged = selection;
      if (field) {
        const current = state.internalDataSelections[uuid];
        merged = {
          ...current,
          ...selection,
          selection: {
            ...(current?.selection ?? {}),
            ...(selection.selection ?? {}),
          } as DataSelection['selection'],
        };
      }
      state.updateInternalDataSelections({ [uuid]: merged });
    },

    applyExternalFilters: (filters: UDIFilter[]) => {
      const { dataSelections, removedFilters } = get();
      const next = { ...dataSelections };
      const removed = { ...removedFilters };
      const seen = new Set<string>();
      let changed = false;
      for (const f of filters) {
        // A host echoing `onFiltersChange` straight back would otherwise copy
        // every chat and chart filter in as a host filter.
        if (f.origin === 'chat' || f.origin === 'chart') continue;
        const key = HOST_FILTER_PREFIX + f.id;
        seen.add(key);
        const selection: DataSelection = {
          dataSourceKey: f.dataSourceKey,
          type: f.type,
          selection: f.selection,
        };
        const json = JSON.stringify(selection);
        if (appliedHostFilters.get(key) === json) continue;
        appliedHostFilters.set(key, json);
        next[key] = selection;
        delete removed[key];
        changed = true;
      }
      for (const key of [...appliedHostFilters.keys()]) {
        if (seen.has(key)) continue;
        appliedHostFilters.delete(key);
        delete next[key];
        delete removed[key];
        changed = true;
      }
      if (changed) set({ dataSelections: next, removedFilters: removed });
    },

    // Host filters belong to the embedding page, not the conversation, so a
    // reset or conversation switch keeps them.
    resetFilters: () => {
      set((s) => ({
        dataSelections: Object.fromEntries(
          Object.entries(s.dataSelections).filter(([k]) => k.startsWith(HOST_FILTER_PREFIX)),
        ),
        internalDataSelections: {},
        removedFilters: {},
        brushAnchors: {},
      }));
    },

    setHoveredFilter: (hoveredFilter) => set({ hoveredFilter }),

    setDataSelection: (key: string, selection: DataSelection) => {
      set((state) => {
        if (!selectionHasValue(selection) || !state.removedFilters[key]) {
          return { dataSelections: { ...state.dataSelections, [key]: selection } };
        }
        const removedFilters = { ...state.removedFilters };
        delete removedFilters[key];
        return { dataSelections: { ...state.dataSelections, [key]: selection }, removedFilters };
      });
    },
  }));
}
