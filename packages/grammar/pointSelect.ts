// Shift-click multi-select for point selections (VegaLite.vue + UDIVis.vue).
// Pure and import-free so test/point-select.mjs can load this file directly.

type PointSelection = Record<string, string[]>;

/** The Vega signal holding a gesture's picks; null outside a gesture. */
export const PICK_SIGNAL = 'udi_pick';

/** Normalize a `select.fields` value to a list. */
export function selectFields(raw: string | string[] | undefined): string[] {
  return raw == null ? [] : typeof raw === 'string' ? [raw] : raw;
}

/**
 * Toggle one clicked datum in or out of a point selection. A datum counts as
 * picked when every field already holds its value; picking adds each field's
 * value, unpicking removes them. Returns null once nothing is left.
 *
 * ponytail: per-field value lists AND across fields, so a multi-field pick
 * (e.g. two stacked-bar segments) filters to the cross product of their
 * values, not just those segments. Tuple selections would fix it, and need a
 * selection shape both executors understand.
 */
export function togglePointValues(
  current: PointSelection | null,
  datum: Record<string, unknown>,
  fields: string[],
): PointSelection | null {
  const next: PointSelection = { ...(current ?? {}) };
  const values = fields.map((f) => String(datum[f]));
  const picked = fields.every((f, i) => next[f]?.includes(values[i]));
  fields.forEach((f, i) => {
    const list = next[f] ?? [];
    next[f] = picked
      ? list.filter((v) => v !== values[i])
      : list.includes(values[i])
        ? list
        : [...list, values[i]];
  });
  return Object.values(next).some((list) => list.length > 0) ? next : null;
}

/**
 * Vega expression that is true for a mark to dim during a gesture: one not
 * matching the picks on every field. False outside a gesture (the signal is
 * null), so the condition leaves the mark's own opacity alone.
 */
export function pickDimTest(fields: string[]): string {
  const match = fields
    .map((f) => {
      const key = JSON.stringify(f);
      return `indexof(${PICK_SIGNAL}[${key}] || [], toString(datum[${key}])) >= 0`;
    })
    .join(' && ');
  return `${PICK_SIGNAL} && !(${match})`;
}
