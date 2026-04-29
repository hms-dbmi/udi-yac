import { createStore } from 'zustand/vanilla';
import type {
  DataSelection,
  DataSelections,
  RangeSelection,
  PointSelection,
} from 'udi-toolkit/react';
import type { Message, ToolCall } from '@/types/messages';
import type { FilterDataArgs } from '@/features/tool-calls';

export type { DataSelection, DataSelections };

export interface ExtractedFilter {
  args: FilterDataArgs;
  toolCallIndex: number;
}

interface ValidateFilterFn {
  isValidIntervalFilter: (entity: string, field: string) => { isValid: string };
  isValidPointFilter: (entity: string, field: string, values: unknown[]) => { isValid: string };
}

export interface DataFiltersState {
  dataSelections: DataSelections;
  internalDataSelections: DataSelections;

  getValidDataSelections: (validate: ValidateFilterFn) => DataSelections;
  syncFiltersFromMessages: (messages: Message[], validate: ValidateFilterFn) => void;
  syncSelectionsBackToMessages: (messages: Message[]) => void;
  updateInternalDataSelections: (newFilters: DataSelections) => void;
  clearFilter: (key: string) => void;
  resetFilters: () => void;
  setDataSelection: (key: string, selection: DataSelection) => void;
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

export function createDataFiltersStore() {
  return createStore<DataFiltersState>()((set, get) => ({
    dataSelections: {},
    internalDataSelections: {},

    getValidDataSelections: (validate: ValidateFilterFn): DataSelections => {
      const { dataSelections } = get();
      const valid: DataSelections = {};
      for (const [key, selection] of Object.entries(dataSelections)) {
        if (!selection.selection || Object.keys(selection.selection).length === 0) continue;
        if (Object.values(selection.selection).every((v) => Array.isArray(v) && v.length === 0))
          continue;
        if (!key.startsWith('message-filter-')) continue;

        if (selection.type === 'interval') {
          if (
            validate.isValidIntervalFilter(
              selection.dataSourceKey,
              Object.keys(selection.selection)[0],
            ).isValid === 'yes'
          ) {
            valid[key] = selection;
          }
        } else if (selection.type === 'point') {
          if (
            validate.isValidPointFilter(
              selection.dataSourceKey,
              Object.keys(selection.selection)[0],
              Object.values(selection.selection)[0],
            ).isValid === 'yes'
          ) {
            valid[key] = selection;
          }
        }
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
            if (
              validate.isValidIntervalFilter(filterSpec.entity, filterSpec.field).isValid !== 'yes'
            )
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
              validate.isValidPointFilter(
                filterSpec.entity,
                filterSpec.field,
                filterSpec.filter.pointValues,
              ).isValid !== 'yes'
            )
              continue;
            next[key] = {
              dataSourceKey: filterSpec.entity,
              type: 'point',
              selection: { [filterSpec.field]: filterSpec.filter.pointValues },
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
            | { intervalRange?: { min: number; max: number } }
            | undefined;
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

    updateInternalDataSelections: (newFilters: DataSelections) => {
      const current = get().internalDataSelections;
      const next = { ...current };
      let changed = false;
      for (const [key, newFilter] of Object.entries(newFilters)) {
        if (key.startsWith('message-filter-')) continue;
        if (JSON.stringify(next[key]) !== JSON.stringify(newFilter)) {
          next[key] = newFilter;
          changed = true;
        }
      }
      if (changed) set({ internalDataSelections: next });
    },

    clearFilter: (key: string) => {
      const { dataSelections, internalDataSelections } = get();

      const nextData = { ...dataSelections };
      const nextInternal = { ...internalDataSelections };
      if (nextData[key]) nextData[key] = { ...nextData[key], selection: null };
      if (nextInternal[key]) nextInternal[key] = { ...nextInternal[key], selection: null };
      set({ dataSelections: nextData, internalDataSelections: nextInternal });
    },

    resetFilters: () => {
      set({ dataSelections: {}, internalDataSelections: {} });
    },

    setDataSelection: (key: string, selection: DataSelection) => {
      set((state) => ({
        dataSelections: { ...state.dataSelections, [key]: selection },
      }));
    },
  }));
}
