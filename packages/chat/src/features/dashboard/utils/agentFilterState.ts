import type { FilterScope } from '@/features/tool-calls';
import type { Message } from '@/types/messages';
import type { LinkGroup } from '@/types/dataPackage';
import { canonicalColumn } from './linkedSelections';
import type { ActiveFilter } from '../hooks/useFilterChips';
import {
  columnFilterKey,
  extractAllFilterSpecsFromMessage,
  HOST_FILTER_PREFIX,
  type FilterOrigin,
} from '../stores/dataFiltersStore';

/**
 * One field of one active filter, as the agent reads it (`udiagent.filters`).
 * The completions request carries every one, so the agent sees the filters as
 * they are now — the user's edits, removals and brushes included — rather than
 * the FilterData calls it once made.
 */
export interface AgentFilterEntry {
  id: string;
  origin: FilterOrigin;
  /** On host filters only: `true` for a separate one, which the agent may not
   *  change; `false` for a shared one (a column filter), which it may. */
  readOnly?: boolean;
  title?: string;
  entity: string;
  field: string;
  filterType: 'point' | 'interval';
  pointValues?: string[];
  intervalRange?: { min: number; max: number };
  scope?: FilterScope;
}

/** The title the agent last gave each column's filter, keyed by filter id —
 *  the canonical column's, for a filter kept there (see `canonicalFilter`). */
function chatFilterTitles(messages: Message[], links: LinkGroup[]): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const message of messages) {
    for (const { args } of extractAllFilterSpecsFromMessage(message)) {
      if (!args.title) continue;
      const { entity, field } = canonicalColumn(links, args.entity, args.field);
      titles[columnFilterKey(entity, field)] = args.title;
    }
  }
  return titles;
}

export function agentFilterState(
  filters: ActiveFilter[],
  scopes: Record<string, FilterScope>,
  messages: Message[],
  links: LinkGroup[] = [],
): AgentFilterEntry[] {
  const titles = chatFilterTitles(messages, links);
  return filters.flatMap(({ id, origin, selection }) =>
    Object.entries(selection.selection ?? {}).map(([field, raw]) => {
      const values = Array.isArray(raw) ? raw : [];
      const entry: AgentFilterEntry = {
        id,
        origin,
        entity: selection.dataSourceKey,
        field,
        filterType: selection.type,
      };
      if (origin === 'host') entry.readOnly = id.startsWith(HOST_FILTER_PREFIX);
      if (titles[id]) entry.title = titles[id];
      if (selection.type === 'point') {
        entry.pointValues = values.map((v) => String(v));
      } else if (values.length === 2) {
        entry.intervalRange = { min: Number(values[0]), max: Number(values[1]) };
      }
      if (scopes[id]) entry.scope = scopes[id];
      return entry;
    }),
  );
}
