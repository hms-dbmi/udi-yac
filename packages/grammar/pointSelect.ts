// Multi-select for point selections (VegaLite.vue + UDIVis.vue): Shift-click
// picks a contiguous range, Ctrl-click (⌘-click on macOS) toggles marks one by
// one. Pure and import-free so test/point-select.mjs can load this file
// directly.

type PointSelection = Record<string, string[]>;

/** How a held modifier multi-selects: `range` spans every category from the
 *  first click to the latest, `toggle` adds or removes each clicked mark. */
export type PickMode = 'range' | 'toggle';

/**
 * The multi-select a click or pointer event's modifiers ask for. Ctrl and ⌘
 * both toggle, on every platform: Windows reserves the Windows key and macOS
 * turns Ctrl-click into a right-click, so each platform only ever reaches its
 * own. Shift wins when both are held.
 */
export function pickModeOf(event: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): PickMode | null {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return null;
}

/** The multi-select a `KeyboardEvent.key` starts or ends. */
export function keyPickMode(key: string): PickMode | null {
  if (key === 'Shift') return 'range';
  if (key === 'Control' || key === 'Meta') return 'toggle';
  return null;
}

/**
 * The categories from `anchor` to `value`, inclusive and in the scale's order —
 * which the renderer fixes, so a range doesn't depend on the rows. Either end
 * missing from the domain leaves just the two ends.
 */
export function rangePicks(
  domain: readonly unknown[],
  anchor: string,
  value: string,
): string[] {
  const order = domain.map((v) =>
    String(v as string | number | boolean | null),
  );
  const from = order.indexOf(anchor);
  const to = order.indexOf(value);
  if (from < 0 || to < 0) return anchor === value ? [anchor] : [anchor, value];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** The Vega-Lite channel (and so scale name) whose field is `field`, from the
 *  first layer that encodes it. Field names arrive escaped for Vega-Lite. */
export function fieldChannel(spec: object, field: string): string | null {
  const layers =
    (spec as { layer?: { encoding?: Record<string, { field?: string }> }[] })
      .layer ?? [];
  for (const layer of layers) {
    for (const [channel, def] of Object.entries(layer.encoding ?? {})) {
      if (def?.field?.replace(/\\\./g, '.') === field) return channel;
    }
  }
  return null;
}

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
 * matching the picks. False outside a gesture (the signal is null), so the
 * condition leaves the mark's own opacity alone. A field with nothing picked
 * matches any mark, as the store's point filter skips it — a label click picks
 * a stacked bar's category and leaves its color field empty — but with nothing
 * picked on any field, every mark dims.
 */
export function pickDimTest(fields: string[]): string {
  const picks = (key: string) => `length(${PICK_SIGNAL}[${key}] || [])`;
  const keys = fields.map((f) => JSON.stringify(f));
  const anyPicked = keys.map((key) => `${picks(key)} > 0`).join(' || ');
  const match = keys
    .map(
      (key) =>
        `(${picks(key)} == 0 || indexof(${PICK_SIGNAL}[${key}], toString(datum[${key}])) >= 0)`,
    )
    .join(' && ');
  return `${PICK_SIGNAL} && !((${anyPicked}) && ${match})`;
}
