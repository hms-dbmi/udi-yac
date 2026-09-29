// Category-axis labels on bar charts (VegaLite.vue). A label whose category a
// filter has emptied is grayed out. Where the chart's point selection covers
// the axis, labels are also clickable: a click selects the category as if its
// bar had been clicked — the only way to pick a bar too thin to hit — and
// hovering one shows the bar's total. Pure and import-free so
// test/axis-label-select.mjs can load this file directly.

/** Mark name of the clickable labels, which Vega's SVG renderer also emits as
 *  their CSS class. */
export const CLICKABLE_LABELS = 'udi-clickable-labels';

/** Signal holding each drawn category's bar total, keyed by category. A
 *  category missing from it has no rows left; the tooltip and the gray-out read
 *  it. */
export const LABEL_TOTALS_SIGNAL = 'udi_label_totals';

/** Opacity of a label whose category has no rows left. */
export const EMPTY_LABEL_OPACITY = 0.35;

export interface LabelAxis {
  channel: 'x' | 'y';
  /** The category field, unescaped: what rows and selections are keyed by. */
  field: string;
  title: string;
  /** Whether the chart's point selection covers the field, so a label click
   *  can build the selection a bar click would. */
  clickable: boolean;
  /** The field the bars' length encodes, summed per category for the tooltip. */
  measure?: string | undefined;
  measureTitle?: string | undefined;
}

interface VlFieldDef {
  field?: string;
  type?: string;
  title?: string;
}

interface VlLayer {
  mark?: string | { type?: string };
  encoding?: Record<string, VlFieldDef | undefined>;
}

// convertToVegaSpec escapes dots in field names for Vega-Lite.
const unescapeField = (field: string) => field.replace(/\\\./g, '.');

/**
 * The category axis of the spec's first bar layer, or null. `fields` are the
 * chart's point-selection fields: only an axis among them is clickable.
 */
export function findLabelAxis(
  spec: object,
  fields: string[],
): LabelAxis | null {
  for (const layer of (spec as { layer?: VlLayer[] }).layer ?? []) {
    const mark = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
    if (mark !== 'bar') continue;
    for (const [channel, other] of [
      ['x', 'y'],
      ['y', 'x'],
    ] as const) {
      const def = layer.encoding?.[channel];
      if (!def?.field || (def.type !== 'nominal' && def.type !== 'ordinal'))
        continue;
      const field = unescapeField(def.field);
      const length = layer.encoding?.[other];
      const measure =
        length?.field && length.type === 'quantitative'
          ? unescapeField(length.field)
          : undefined;
      return {
        channel,
        field,
        title: def.title ?? field,
        clickable: fields.includes(field),
        measure,
        measureTitle: measure ? (length?.title ?? measure) : undefined,
      };
    }
  }
  return null;
}

type VgEncodeEntry = Record<string, unknown> & {
  update?: Record<string, unknown>;
};

interface VgAxis {
  scale?: string;
  labels?: boolean;
  encode?: Record<string, VgEncodeEntry | undefined>;
}

/**
 * Gray out the axis's empty categories in the compiled Vega spec and, for a
 * clickable axis, make its labels interactive with a tooltip. Vega-Lite's
 * `axis.encoding` only reaches the labels' update set, and interactivity and a
 * mark name sit outside it, so this has to happen after compilation (vega-embed's
 * `patch`). Both read LABEL_TOTALS_SIGNAL, and re-encode when it changes.
 */
export function patchLabelAxis<T extends object>(spec: T, axis: LabelAxis): T {
  const vg = spec as { axes?: VgAxis[]; signals?: object[] };
  const key = (text: string) => JSON.stringify(text);
  const tooltip = axis.measure
    ? `{${key(axis.title)}: datum.value, ${key(axis.measureTitle ?? axis.measure)}: ` +
      `format(${LABEL_TOTALS_SIGNAL}[datum.value] || 0, ',.2~f')}`
    : `{${key(axis.title)}: datum.value}`;
  vg.signals = [
    ...(vg.signals ?? []),
    { name: LABEL_TOTALS_SIGNAL, value: {} },
  ];
  for (const vgAxis of vg.axes ?? []) {
    if (vgAxis.scale !== axis.channel || vgAxis.labels === false) continue;
    const labels = vgAxis.encode?.labels ?? {};
    const opacity = {
      signal: `${LABEL_TOTALS_SIGNAL}[datum.value] == null ? ${EMPTY_LABEL_OPACITY} : 1`,
    };
    vgAxis.encode = {
      ...vgAxis.encode,
      labels: axis.clickable
        ? {
            ...labels,
            name: CLICKABLE_LABELS,
            interactive: true,
            update: { ...labels.update, opacity, tooltip: { signal: tooltip } },
          }
        : { ...labels, update: { ...labels.update, opacity } },
    };
  }
  return spec;
}

type Cell = string | number | boolean | null | undefined;

/** Each category's summed measure (its row count, without a measure) over the
 *  rows the chart currently draws — a stacked bar's total, not one segment's.
 *  Only categories with rows get a key. Keyed as Vega keys an object by
 *  `datum.value`. */
export function categoryTotals(
  rows: object[],
  axis: LabelAxis,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows as Record<string, Cell>[]) {
    const category = String(row[axis.field]);
    const add = axis.measure ? Number(row[axis.measure]) || 0 : 1;
    totals[category] = (totals[category] ?? 0) + add;
  }
  return totals;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Where to draw a label's underline: along the bottom of its box, turned with
 * the label when the axis rotates it. `toContainer` maps the label's own
 * coordinates (those getBBox reports) into the overlay's.
 */
export function underlineGeometry(
  box: { x: number; y: number; width: number; height: number },
  toContainer: (x: number, y: number) => Point,
): { left: number; top: number; width: number; angle: number } {
  const start = toContainer(box.x, box.y + box.height);
  const end = toContainer(box.x + box.width, box.y + box.height);
  return {
    left: start.x,
    top: start.y,
    width: Math.hypot(end.x - start.x, end.y - start.y),
    angle: Math.atan2(end.y - start.y, end.x - start.x),
  };
}
