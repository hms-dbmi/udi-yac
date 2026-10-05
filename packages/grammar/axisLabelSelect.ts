// Category labels (VegaLite.vue): a bar chart's category axis, and any chart's
// color legend. A label whose category a filter has emptied is grayed out.
// Where the chart's point selection covers the field, labels are also
// clickable: a click selects the category as if its mark had been clicked —
// the only way to pick a bar too thin to hit — and hovering one shows its
// total. Pure and import-free so test/axis-label-select.mjs can load this file
// directly.

/** Mark name of the clickable labels, which Vega's SVG renderer also emits as
 *  their CSS class. */
export const CLICKABLE_LABELS = 'udi-clickable-labels';

/** Mark names of a clickable color legend's labels and symbols. */
export const CLICKABLE_LEGEND = 'udi-clickable-legend';
export const CLICKABLE_LEGEND_SYMBOLS = 'udi-clickable-legend-symbols';

/** Signal holding each drawn category's bar total, keyed by category. A
 *  category missing from it has no rows left; the tooltip and the gray-out read
 *  it. */
export const LABEL_TOTALS_SIGNAL = 'udi_label_totals';

/** The same for the color legend's categories. */
export const LEGEND_TOTALS_SIGNAL = 'udi_legend_totals';

/** Opacity of a label whose category has no rows left. */
export const EMPTY_LABEL_OPACITY = 0.35;

/** A category guide: the bar axis (x/y) or the color legend. */
export interface LabelAxis {
  channel: 'x' | 'y' | 'color';
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

/**
 * The color legend of the spec's first layer that colors by category, or null.
 * `fields` are the chart's point-selection fields: only a legend among them is
 * clickable. Its measure is what the layer's marks encode (a bar's length, a
 * slice's angle), so the tooltip total matches what is drawn.
 */
export function findLabelLegend(
  spec: object,
  fields: string[],
): LabelAxis | null {
  for (const layer of (spec as { layer?: VlLayer[] }).layer ?? []) {
    const def = layer.encoding?.color;
    if (!def?.field || (def.type !== 'nominal' && def.type !== 'ordinal'))
      continue;
    const field = unescapeField(def.field);
    const length = ['x', 'y', 'theta']
      .map((channel) => layer.encoding?.[channel])
      .find((d) => d?.field && d.type === 'quantitative');
    const measure = length?.field ? unescapeField(length.field) : undefined;
    return {
      channel: 'color',
      field,
      title: def.title ?? field,
      clickable: fields.includes(field),
      measure,
      measureTitle: measure ? (length?.title ?? measure) : undefined,
    };
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
export function patchLabelAxis<T extends object>(
  spec: T,
  axis: LabelAxis,
  pickSignal?: string,
): T {
  const vg = spec as { axes?: VgAxis[]; signals?: VgSignal[] };
  addSignals(vg, LABEL_TOTALS_SIGNAL, {}, pickSignal);
  for (const vgAxis of vg.axes ?? []) {
    if (vgAxis.scale !== axis.channel || vgAxis.labels === false) continue;
    vgAxis.encode = {
      ...vgAxis.encode,
      labels: patchGuideMark(
        vgAxis.encode?.labels,
        axis,
        LABEL_TOTALS_SIGNAL,
        CLICKABLE_LABELS,
        pickSignal,
      ),
    };
  }
  return spec;
}

interface VgLegend {
  fill?: string;
  stroke?: string;
  encode?: Record<string, VgEncodeEntry | undefined>;
}

/** The legend counterpart of patchLabelAxis: gray out the color legend's
 *  empty categories, and make its labels and symbols clickable when the legend
 *  is. Reads LEGEND_TOTALS_SIGNAL. */
export function patchLabelLegend<T extends object>(
  spec: T,
  legend: LabelAxis,
  pickSignal?: string,
): T {
  const vg = spec as { legends?: VgLegend[]; signals?: VgSignal[] };
  addSignals(vg, LEGEND_TOTALS_SIGNAL, {}, pickSignal);
  for (const vgLegend of vg.legends ?? []) {
    if (vgLegend.fill !== 'color' && vgLegend.stroke !== 'color') continue;
    vgLegend.encode = {
      ...vgLegend.encode,
      labels: patchGuideMark(
        vgLegend.encode?.labels,
        legend,
        LEGEND_TOTALS_SIGNAL,
        CLICKABLE_LEGEND,
        pickSignal,
      ),
      symbols: patchGuideMark(
        vgLegend.encode?.symbols,
        legend,
        LEGEND_TOTALS_SIGNAL,
        CLICKABLE_LEGEND_SYMBOLS,
        pickSignal,
      ),
    };
  }
  return spec;
}

interface VgSignal {
  name: string;
  value?: unknown;
}

/** The guide's totals signal, plus, when a gesture's picks are given, the
 *  picks signal itself. UDIVis declares that one only on charts whose marks it
 *  dims, and both patches share it, so it is added only where missing: Vega
 *  rejects a signal declared twice. */
function addSignals(
  vg: { signals?: VgSignal[] },
  totals: string,
  value: unknown,
  pickSignal: string | undefined,
): void {
  const signals = [...(vg.signals ?? []), { name: totals, value }];
  if (pickSignal && !signals.some((s) => s.name === pickSignal))
    signals.push({ name: pickSignal, value: null });
  vg.signals = signals;
}

/** One guide mark's encode block (a label or legend-symbol set, whose datum
 *  is `{value}`): dimmed when its category has no total in `totals`, and when
 *  the guide is clickable, named, interactive and with the total's tooltip.
 *  With `pickSignal`, an empty category the current gesture is picking shows
 *  at full color: its rows come once the gesture commits, so it reads as
 *  pending rather than still empty. */
function patchGuideMark(
  entry: VgEncodeEntry | undefined,
  guide: LabelAxis,
  totals: string,
  name: string,
  pickSignal?: string,
): VgEncodeEntry {
  const block = entry ?? {};
  const key = (text: string) => JSON.stringify(text);
  const empty = `${totals}[datum.value] == null`;
  const dimmed = String(EMPTY_LABEL_OPACITY);
  const pending =
    pickSignal && guide.clickable
      ? `${pickSignal} && indexof(${pickSignal}[${key(guide.field)}] || [], ` +
        `toString(datum.value)) >= 0`
      : null;
  const opacity = {
    signal: pending
      ? `${empty} && !(${pending}) ? ${dimmed} : 1`
      : `${empty} ? ${dimmed} : 1`,
  };
  if (!guide.clickable)
    return { ...block, update: { ...block.update, opacity } };
  const tooltip = guide.measure
    ? `{${key(guide.title)}: datum.value, ${key(guide.measureTitle ?? guide.measure)}: ` +
      `format(${totals}[datum.value] || 0, ',.2~f')}`
    : `{${key(guide.title)}: datum.value}`;
  return {
    ...block,
    name,
    interactive: true,
    update: { ...block.update, opacity, tooltip: { signal: tooltip } },
  };
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
