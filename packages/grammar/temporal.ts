import type { DataSource, DataTransformation } from './GrammarTypes';

/**
 * Date columns, so charts and tables show dates instead of the stored numbers.
 *
 * A data package marks a date column with `udi:time_format` on the field. The
 * column keeps its data type (an epoch-ms column stays `quantitative`), so
 * transformations, selections and the SQL executor treat it as a number; only
 * the renderers read the format. Only `epoch_ms` is rendered today — a format
 * is passed through untouched until a renderer learns it.
 */
/** Entity → field → `udi:time_format`. */
export type TimeFormats = Record<string, Record<string, string>>;

// Module singleton, set once per data package — same pattern as the query
// backend (queryBackend.ts).
let timeFormats: TimeFormats = {};

/** Register the data package's date columns, e.g.
 *  `{ datasets: { created_timestamp: 'epoch_ms' } }`. Replaces the previous set. */
export function setTimeFormats(byEntity: TimeFormats): void {
  timeFormats = byEntity;
}

// Aggregates whose result is still a point in time. `sum` and `count` aren't.
const DATE_PRESERVING_OPS = new Set(['min', 'max', 'mean', 'median']);

/**
 * The time format of every column a spec's transformations produce that holds
 * a date: the source entities' registered columns, the `min`/`max`/`mean`/
 * `median` of one, and a binby's start/end or a kde's sample over one. Any
 * other output written under a date column's name stops being a date.
 *
 * ponytail: lineage by column name across the whole pipeline, ignoring `in`/
 * `out` table names; a join's suffixed collision columns are not tracked.
 */
export function timeColumns(spec: {
  source: DataSource | DataSource[];
  transformation?: DataTransformation[] | undefined;
}): Map<string, string> {
  const columns = new Map<string, string>();
  const sources = Array.isArray(spec.source) ? spec.source : [spec.source];
  for (const source of sources) {
    for (const [field, format] of Object.entries(
      timeFormats[source.name] ?? {},
    )) {
      columns.set(field, format);
    }
  }
  for (const t of spec.transformation ?? []) {
    if ('binby' in t) {
      const format = columns.get(t.binby.field);
      const { bin_start = 'start', bin_end = 'end' } = t.binby.output ?? {};
      for (const out of [bin_start, bin_end]) {
        if (format) columns.set(out, format);
        else columns.delete(out);
      }
    } else if ('rollup' in t) {
      for (const [out, agg] of Object.entries(t.rollup)) {
        const format = agg.field ? columns.get(agg.field) : undefined;
        if (format && DATE_PRESERVING_OPS.has(agg.op)) columns.set(out, format);
        else columns.delete(out);
      }
    } else if ('kde' in t) {
      const format = columns.get(t.kde.field);
      const { sample = 'sample', density = 'density' } = t.kde.output ?? {};
      if (format) columns.set(sample, format);
      else columns.delete(sample);
      columns.delete(density);
    } else if ('derive' in t) {
      for (const out of Object.keys(t.derive)) columns.delete(out);
    }
  }
  return columns;
}

/** Whether `field` holds epoch-ms dates — the one format the renderers handle. */
export function isEpochMs(
  columns: Map<string, string>,
  field: string,
): boolean {
  return columns.get(field) === 'epoch_ms';
}
