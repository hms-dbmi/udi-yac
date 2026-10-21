import type { UDIGrammar } from 'udi-toolkit';
import {
  columnFilterKey,
  type DataSelection,
  type DataSelections,
} from '../stores/dataFiltersStore';

/** What a chart selects on: the table its selection reads, whether it is a
 *  click (`point`) or a brush (`interval`), and the source columns it covers. */
export interface ChartSelectFields {
  entity: string;
  type: 'point' | 'interval';
  fields: string[];
}

interface SelectLike {
  source?: string;
  how?: { type?: string; field?: string | string[] };
  fields?: string | string[];
}

const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** The `select` `injectInteractivity` put on the chart's first layer, read
 *  back. Null for a chart with nothing to select on (a table). */
export function chartSelectFields(spec: UDIGrammar): ChartSelectFields | null {
  const reps = spec.representation as unknown;
  const first = (Array.isArray(reps) ? reps[0] : reps) as { select?: SelectLike } | undefined;
  const select = first?.select;
  if (!select?.how?.type || !select.source) return null;
  const type = select.how.type === 'interval' ? 'interval' : 'point';
  const fields = type === 'interval' ? asList(select.how.field) : asList(select.fields);
  return fields.length > 0 ? { entity: select.source, type, fields } : null;
}

/**
 * The chart's own selection as the column filters on its fields hold it,
 * whoever set them — so a filter set in chat, or on another chart, shows on
 * this one. A filter of the other kind (a range on a chart that clicks) has
 * no way to show here and is left out. With nothing to show the selection is
 * `null`, not `{}`: the toolkit reads any non-null selection as one to redraw
 * the brush from, and would then stop keeping the brush the user is drawing.
 */
export function composeChartSelection(
  select: ChartSelectFields,
  dataSelections: DataSelections,
): DataSelection {
  const selection: Record<string, unknown> = {};
  for (const field of select.fields) {
    const filter = dataSelections[columnFilterKey(select.entity, field)];
    const value = (filter?.selection as Record<string, unknown> | null | undefined)?.[field];
    if (filter?.type === select.type && Array.isArray(value) && value.length > 0) {
      selection[field] = value;
    }
  }
  return {
    dataSourceKey: select.entity,
    type: select.type,
    selection: Object.keys(selection).length > 0 ? (selection as DataSelection['selection']) : null,
  };
}

/** Whether filter `id` is on a column this chart selects on. */
export function chartCoversFilter(select: ChartSelectFields | null, id: string): boolean {
  return !!select?.fields.some((f) => columnFilterKey(select.entity, f) === id);
}
