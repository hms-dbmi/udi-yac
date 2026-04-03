import { createStore } from 'zustand/vanilla';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { Message } from '@/types/messages';

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
  pinKey: (messageIndex: number, toolCallIndex: number) => string;
  pinVisualization: (
    index: number,
    toolCallIndex: number,
    spec: UDIGrammar,
    userPrompt: string,
    sourceFields: Record<string, string[]> | null,
    title?: string,
  ) => void;
  unpinVisualization: (key: string) => void;
  isPinned: (key: string) => boolean;
  clearAllVisualizations: () => void;
}

let counter = 0;

function generateId(): string {
  return `udi_${Date.now()}_${++counter}`;
}

function structuredClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function injectInteractivity(
  spec: UDIGrammar,
  id: string,
  sourceFields: Record<string, string[]> | null,
): UDIGrammar {
  const sourceData = Array.isArray(spec.source) ? spec.source : [spec.source];
  const sourceName = (sourceData[0] as any)?.name ?? 'unknown_source';
  const interactiveSpec = structuredClone(spec);
  let firstRepresentation = interactiveSpec.representation;
  if (Array.isArray(firstRepresentation)) {
    firstRepresentation = firstRepresentation[0];
  }
  if (!firstRepresentation) return interactiveSpec;
  if ((firstRepresentation as any).mark === 'row') return interactiveSpec;

  const mappingList = Array.isArray((firstRepresentation as any).mapping)
    ? (firstRepresentation as any).mapping
    : [(firstRepresentation as any).mapping];

  const resolveField = (mapping: { field: string; title?: string }) => {
    const fields = sourceFields?.[sourceName];
    if (!fields) return mapping.field;
    if (fields.includes(mapping.field)) return mapping.field;
    if (mapping.title && fields.includes(mapping.title)) return mapping.title;
    return null;
  };

  const intervalDimensions = mappingList.filter(
    (mapping: any) =>
      mapping.type === 'quantitative' &&
      (mapping.encoding === 'x' || mapping.encoding === 'y') &&
      resolveField(mapping) !== null,
  );

  const intervalSelectionOn = intervalDimensions
    .map((m: any) => m.encoding)
    .sort()
    .join('');

  const intervalFields = intervalDimensions
    .sort((a: any, b: any) => a.encoding.localeCompare(b.encoding))
    .map((m: any) => resolveField(m))
    .filter((f: string | null): f is string => f !== null);

  if (intervalSelectionOn.length > 0) {
    (firstRepresentation as any)['select'] = {
      name: id,
      source: sourceName,
      how: { type: 'interval', on: intervalSelectionOn, field: intervalFields },
    };
  } else {
    const categoricalDimensions = mappingList.filter(
      (mapping: any) =>
        mapping.type !== 'quantitative' &&
        (mapping.encoding === 'x' || mapping.encoding === 'y' || mapping.encoding === 'color') &&
        resolveField(mapping) !== null,
    );
    (firstRepresentation as any)['select'] = {
      name: id,
      source: sourceName,
      how: { type: 'point' },
      fields: categoricalDimensions.map((m: any) => resolveField(m)!),
    };
  }

  interactiveSpec.config = { hideActions: true };
  return interactiveSpec;
}

export function createDashboardStore() {
  return createStore<DashboardState>()((set, get) => ({
    pinnedVisualizations: new Map(),

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

    unpinVisualization: (key) => {
      set((state) => {
        const next = new Map(state.pinnedVisualizations);
        next.delete(key);
        return { pinnedVisualizations: next };
      });
    },

    isPinned: (key) => get().pinnedVisualizations.has(key),

    clearAllVisualizations: () => set({ pinnedVisualizations: new Map() }),
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
  arguments: Record<string, any>;
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
