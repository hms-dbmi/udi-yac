import type { Layout, LayoutItem } from 'react-grid-layout';
import type { Message } from '@/types/messages';
import { EMPTY_USAGE, type SessionUsage } from '@/types/usage';
import type {
  DashboardExport,
  DashboardExportVisualization,
  DashboardLayout,
} from '../stores/dashboardStore';
import { DEFAULT_CARD_H, DEFAULT_CARD_W, MIN_CARD_H, MIN_CARD_W } from './gridDefaults';
import { packAllRowMajor } from './gridPacking';

export const SESSION_EXPORT_VERSION = 1 as const;

export interface SessionExport {
  version: typeof SESSION_EXPORT_VERSION;
  exportedAt: string;
  conversation: {
    messages: Message[];
    /** Accumulated token total. Omitted by exports predating the counter. */
    sessionUsage?: SessionUsage;
  };
  visualizations: DashboardExportVisualization[];
  layout: DashboardLayout;
  /** Optional grid configuration (cols + row height). Old exports omit it
   *  and the importer falls back to current defaults. */
  grid?: { cols: number; rowHeight: number };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function parseLayoutItem(raw: unknown, idx: number): ParseResult<LayoutItem> {
  if (!isObject(raw)) return { ok: false, error: `layout.items[${idx}] must be an object` };
  if (typeof raw.i !== 'string')
    return { ok: false, error: `layout.items[${idx}].i must be a string` };
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (typeof raw[k] !== 'number' || !Number.isFinite(raw[k] as number))
      return { ok: false, error: `layout.items[${idx}].${k} must be a finite number` };
  }
  const item: LayoutItem = {
    i: raw.i,
    x: Math.max(0, Math.floor(raw.x as number)),
    y: Math.max(0, Math.floor(raw.y as number)),
    w: Math.max(1, Math.floor(raw.w as number)),
    h: Math.max(1, Math.floor(raw.h as number)),
  };
  if (typeof raw.minW === 'number') item.minW = Math.max(1, Math.floor(raw.minW));
  if (typeof raw.minH === 'number') item.minH = Math.max(1, Math.floor(raw.minH));
  if (typeof raw.maxW === 'number') item.maxW = Math.max(1, Math.floor(raw.maxW));
  if (typeof raw.maxH === 'number') item.maxH = Math.max(1, Math.floor(raw.maxH));
  return { ok: true, value: item };
}

function isV1Layout(raw: unknown): raw is { columns: unknown[]; columnSizes?: unknown } {
  return isObject(raw) && Array.isArray(raw.columns);
}

function isV2Layout(raw: unknown): raw is { items: unknown[] } {
  return isObject(raw) && Array.isArray(raw.items);
}

/**
 * Migrate a v1 column-shaped layout into a v2 item array by flattening cards
 * in column-major reading order and row-major repacking with default sizes.
 * v1 had no col-span concept, so each card lands at w=1.
 */
function migrateV1Layout(raw: { columns: unknown[] }): DashboardLayout {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const col of raw.columns) {
    if (!isObject(col)) continue;
    if (!isStringArray(col.cardKeys)) continue;
    for (const k of col.cardKeys) {
      if (seen.has(k)) continue;
      seen.add(k);
      orderedKeys.push(k);
    }
  }
  const ordered: LayoutItem[] = orderedKeys.map((k) => ({
    i: k,
    x: 0,
    y: 0,
    w: DEFAULT_CARD_W,
    h: DEFAULT_CARD_H,
    minW: MIN_CARD_W,
    minH: MIN_CARD_H,
  }));
  return { items: packAllRowMajor(ordered, 1) };
}

function parseLayout(raw: unknown): ParseResult<DashboardLayout> {
  if (isV2Layout(raw)) {
    const items: LayoutItem[] = [];
    for (let i = 0; i < raw.items.length; i++) {
      const r = parseLayoutItem(raw.items[i], i);
      if (!r.ok) return r;
      items.push(r.value);
    }
    return { ok: true, value: { items } };
  }
  if (isV1Layout(raw)) {
    return { ok: true, value: migrateV1Layout(raw) };
  }
  return { ok: false, error: 'layout must contain an `items` array or v1 `columns` array' };
}

function parseVisualization(raw: unknown, idx: number): ParseResult<DashboardExportVisualization> {
  if (!isObject(raw)) return { ok: false, error: `visualizations[${idx}] must be an object` };
  if (typeof raw.key !== 'string')
    return { ok: false, error: `visualizations[${idx}].key must be a string` };
  if (typeof raw.uuid !== 'string')
    return { ok: false, error: `visualizations[${idx}].uuid must be a string` };
  if (typeof raw.index !== 'number')
    return { ok: false, error: `visualizations[${idx}].index must be a number` };
  if (typeof raw.toolCallIndex !== 'number')
    return { ok: false, error: `visualizations[${idx}].toolCallIndex must be a number` };
  if (typeof raw.userPrompt !== 'string')
    return { ok: false, error: `visualizations[${idx}].userPrompt must be a string` };
  if (!isObject(raw.spec))
    return { ok: false, error: `visualizations[${idx}].spec must be an object` };
  const title = typeof raw.title === 'string' ? raw.title : undefined;
  return {
    ok: true,
    value: {
      key: raw.key,
      uuid: raw.uuid,
      index: raw.index,
      toolCallIndex: raw.toolCallIndex,
      userPrompt: raw.userPrompt,
      title,
      spec: raw.spec as unknown as DashboardExportVisualization['spec'],
    },
  };
}

function parseMessages(raw: unknown): ParseResult<Message[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'conversation.messages must be an array' };
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (!isObject(m)) return { ok: false, error: `conversation.messages[${i}] must be an object` };
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system')
      return { ok: false, error: `conversation.messages[${i}].role is invalid` };
    if (typeof m.content !== 'string')
      return { ok: false, error: `conversation.messages[${i}].content must be a string` };
  }
  return { ok: true, value: raw as Message[] };
}

/** Lenient parse: missing/invalid usage degrades to zeros rather than failing
 *  the whole import. Old exports (no counter) land on `EMPTY_USAGE`. */
function parseSessionUsage(raw: unknown): SessionUsage {
  if (!isObject(raw)) return EMPTY_USAGE;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    promptTokens: n(raw.promptTokens),
    completionTokens: n(raw.completionTokens),
    totalTokens: n(raw.totalTokens),
    cachedPromptTokens: n(raw.cachedPromptTokens),
    reasoningTokens: n(raw.reasoningTokens),
    requests: n(raw.requests),
    lastModel: typeof raw.lastModel === 'string' ? raw.lastModel : undefined,
  };
}

export function parseSessionExport(raw: unknown): ParseResult<SessionExport> {
  if (!isObject(raw)) return { ok: false, error: 'Expected a JSON object at the top level' };
  if (raw.version !== SESSION_EXPORT_VERSION)
    return {
      ok: false,
      error: `Unsupported version ${String(raw.version)} (expected ${SESSION_EXPORT_VERSION})`,
    };
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString();
  if (!isObject(raw.conversation)) return { ok: false, error: 'conversation must be an object' };
  const messagesResult = parseMessages(raw.conversation.messages);
  if (!messagesResult.ok) return messagesResult;
  if (!Array.isArray(raw.visualizations))
    return { ok: false, error: 'visualizations must be an array' };
  const visualizations: DashboardExportVisualization[] = [];
  for (let i = 0; i < raw.visualizations.length; i++) {
    const r = parseVisualization(raw.visualizations[i], i);
    if (!r.ok) return r;
    visualizations.push(r.value);
  }
  const layoutResult = parseLayout(raw.layout);
  if (!layoutResult.ok) return layoutResult;
  let grid: { cols: number; rowHeight: number } | undefined;
  if (
    isObject(raw.grid) &&
    typeof raw.grid.cols === 'number' &&
    Number.isFinite(raw.grid.cols) &&
    typeof raw.grid.rowHeight === 'number' &&
    Number.isFinite(raw.grid.rowHeight)
  ) {
    grid = { cols: raw.grid.cols, rowHeight: raw.grid.rowHeight };
  }
  return {
    ok: true,
    value: {
      version: SESSION_EXPORT_VERSION,
      exportedAt,
      conversation: {
        messages: messagesResult.value,
        sessionUsage: parseSessionUsage(raw.conversation.sessionUsage),
      },
      visualizations,
      layout: layoutResult.value,
      ...(grid ? { grid } : {}),
    },
  };
}

export function buildSessionExport(args: {
  messages: Message[];
  dashboard: DashboardExport;
  grid?: { cols: number; rowHeight: number };
  sessionUsage?: SessionUsage;
}): SessionExport {
  return {
    version: SESSION_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    conversation: {
      messages: args.messages,
      sessionUsage: args.sessionUsage ?? EMPTY_USAGE,
    },
    visualizations: args.dashboard.visualizations,
    layout: args.dashboard.layout,
    ...(args.grid ? { grid: args.grid } : {}),
  };
}

export interface PersistedLayoutSnapshot {
  version: 3;
  layout: DashboardLayout;
  vizKeys: string[];
  gridCols: number;
  gridRowHeight: number;
}

export function parsePersistedLayoutSnapshot(raw: unknown): ParseResult<PersistedLayoutSnapshot> {
  if (!isObject(raw)) return { ok: false, error: 'snapshot must be an object' };
  if (raw.version !== 3) return { ok: false, error: 'snapshot version mismatch' };
  if (!isStringArray(raw.vizKeys)) return { ok: false, error: 'snapshot.vizKeys must be string[]' };
  const layoutResult = parseLayout(raw.layout);
  if (!layoutResult.ok) return layoutResult;
  const gridCols =
    typeof raw.gridCols === 'number' && Number.isFinite(raw.gridCols) ? raw.gridCols : 3;
  const gridRowHeight =
    typeof raw.gridRowHeight === 'number' && Number.isFinite(raw.gridRowHeight)
      ? raw.gridRowHeight
      : 60;
  return {
    ok: true,
    value: {
      version: 3,
      layout: layoutResult.value,
      vizKeys: raw.vizKeys,
      gridCols,
      gridRowHeight,
    },
  };
}

export function buildPersistedLayoutSnapshot(
  layout: DashboardLayout,
  vizKeys: string[],
  gridCols: number,
  gridRowHeight: number,
): PersistedLayoutSnapshot {
  return { version: 3, layout, vizKeys, gridCols, gridRowHeight };
}

export function layoutItems(layout: DashboardLayout): Layout {
  return layout.items;
}
