import type { DataSource, DataTransformation } from './GrammarTypes';

/**
 * Time columns, so charts and tables show dates, years and ages instead of the
 * stored numbers.
 *
 * A data package marks such a column with `udi:time_format` on the field. The
 * column keeps its data type (an epoch-ms column stays `quantitative`), so
 * transformations, selections and the SQL executor treat it as a number; only
 * the renderers read the format. A format no formatter below knows is passed
 * through and rendered as the plain number.
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

/** Column → `udi:time_format`, for one table. */
type Formats = Map<string, string>;

/**
 * The time format of every column a spec's transformations produce that holds
 * a date: the source entities' registered columns, the `min`/`max`/`mean`/
 * `median` of one, a binby's start/end or a kde's sample over one, and a
 * join's renamed copies. Any other output written under a date column's name
 * stops being a date.
 *
 * Formats are kept per named table and follow `in`/`out` the way
 * DataSourcesStore's PerformDataTransformations runs them, so each step reads
 * the formats of the table it actually reads.
 */
export function timeColumns(spec: {
  source: DataSource | DataSource[];
  transformation?: DataTransformation[] | undefined;
}): Formats {
  const sources = Array.isArray(spec.source) ? spec.source : [spec.source];
  const tables = new Map<string, Formats>(
    sources.map((source) => [
      source.name,
      new Map(Object.entries(timeFormats[source.name] ?? {})),
    ]),
  );
  let key = sources[0]?.name ?? '';
  let current: Formats = tables.get(key) ?? new Map();
  for (const t of spec.transformation ?? []) {
    const input =
      typeof t.in === 'string' ? (tables.get(t.in) ?? new Map()) : current;
    // Outputs are written to a copy: every aggregate in a rollup reads the
    // input table, so one written under a date's name must not hide that
    // date from the aggregates after it.
    let output: Formats = new Map(input);
    if ('join' in t) {
      output = joinFormats(
        tables.get(t.in[0]) ?? new Map(),
        tables.get(t.in[1]) ?? new Map(),
        t.join.on,
      );
    } else if ('binby' in t) {
      const format = input.get(t.binby.field);
      const { bin_start = 'start', bin_end = 'end' } = t.binby.output ?? {};
      for (const out of [bin_start, bin_end]) setOrDelete(output, out, format);
    } else if ('rollup' in t) {
      for (const [out, agg] of Object.entries(t.rollup)) {
        const format = agg.field ? input.get(agg.field) : undefined;
        setOrDelete(
          output,
          out,
          DATE_PRESERVING_OPS.has(agg.op) ? format : undefined,
        );
      }
    } else if ('kde' in t) {
      const { sample = 'sample', density = 'density' } = t.kde.output ?? {};
      setOrDelete(output, sample, input.get(t.kde.field));
      output.delete(density);
    } else if ('derive' in t) {
      for (const out of Object.keys(t.derive)) output.delete(out);
    }
    current = output;
    if (t.out) key = t.out;
    else if (typeof t.in === 'string') key = t.in;
    tables.set(key, current);
  }
  return current;
}

function setOrDelete(
  formats: Formats,
  column: string,
  format: string | undefined,
): void {
  if (format) formats.set(column, format);
  else formats.delete(column);
}

/**
 * A join's output formats. Arquero keeps one copy of a same-named join key (the
 * left one) and renames any other column both sides have to `<name>_1` /
 * `<name>_2`, which the SQL compiler matches. Only time columns are tracked, so
 * whether a column collided is unknown here: each format goes under both its
 * plain and its suffixed name. Whichever the output has is the right one, and a
 * non-time column on the other side never picks a format up.
 */
function joinFormats(
  left: Formats,
  right: Formats,
  on: string | [string, string] | [string[], string[]],
): Formats {
  const [leftKey, rightKey] = typeof on === 'string' ? [on, on] : on;
  const sharedKey =
    typeof leftKey === 'string' && leftKey === rightKey ? leftKey : undefined;
  const output: Formats = new Map();
  for (const [column, format] of left) {
    output.set(column, format);
    if (column !== sharedKey) output.set(`${column}_1`, format);
  }
  for (const [column, format] of right) {
    if (column === sharedKey) continue;
    output.set(`${column}_2`, format);
    if (!output.has(column)) output.set(column, format);
  }
  return output;
}

/** Whether `field` holds epoch-ms dates, which charts draw on a time scale. */
export function isEpochMs(
  columns: Map<string, string>,
  field: string,
): boolean {
  return columns.get(field) === 'epoch_ms';
}

export const DAYS_PER_YEAR = 365.25;

// A Map rather than an object literal, so a format named like an Object
// prototype key ("toString") is unknown rather than callable.
const FORMATTERS = new Map<string, (value: number) => string>([
  ['epoch_ms', (v) => new Date(v).toLocaleDateString()],
  ['epoch_s', (v) => new Date(v * 1000).toLocaleDateString()],
  // A calendar year: no thousands separator, and a mean year reads as a year.
  ['year', (v) => String(Math.round(v))],
  // A duration such as an age, read in years.
  ['days', (v) => `${(v / DAYS_PER_YEAR).toFixed(1)} y`],
]);

/** A stored value as its `udi:time_format` reads: `epoch_ms`/`epoch_s` as the
 *  local date, `year` as `1985`, `days` as `12.0 y`. Anything else — an unknown
 *  format, or a missing value — as the plain value. Vega-Lite calls it for
 *  axis, legend and tooltip labels, registered as `udiTime`. */
export function formatTime(value: unknown, format: string): string {
  const formatter = FORMATTERS.get(format);
  return formatter && typeof value === 'number' && Number.isFinite(value)
    ? formatter(value)
    : String(value);
}

/** `field`'s time format, if `formatTime` knows it. */
export function timeFormatOf(
  columns: Map<string, string>,
  field: string,
): string | undefined {
  const format = columns.get(field);
  return format && FORMATTERS.has(format) ? format : undefined;
}
