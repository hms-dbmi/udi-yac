// Vega clips a side legend that runs past the chart's bottom. Under `fit` and
// `fit-x` autosize, which every UDIVis chart uses, layout leaves a side
// legend's height out ("Legends that overrun the chart area will then be
// clipped", vega-view-transforms), so a short chart such as a single stacked
// bar silently loses its last entries.
//
// A chart whose height follows its content can grow, so its bottom padding
// grows until the legend fits. A chart with a fixed height (a dashboard card)
// cannot, so its legend is cut to the rows that fit, the last reading
// "…N entries".
import type { View } from 'vega';

/** The signal each side legend's entry cap reads. */
export const LEGEND_LIMIT_SIGNAL = 'udi_legend_limit';
/** Vega's own default cap. */
const DEFAULT_LIMIT = 30;

interface VgSpec {
  legends?: Array<{ orient?: string; symbolLimit?: unknown }>;
  signals?: Array<{ name: string; value?: unknown }>;
}

interface SceneMark {
  role?: string;
  bounds: { y1: number; y2: number };
  items: Array<{ orient?: string; items?: SceneMark[] }>;
}

/** A legend with no orient sits at the right. */
const isSide = (orient?: string) =>
  orient == null || orient === 'left' || orient === 'right';

/** A Vega spec patch: points each side legend's entry cap at the signal. */
export function patchLegendLimit<T extends object>(spec: T): T {
  const vg = spec as VgSpec;
  const side = (vg.legends ?? []).filter(
    (l) => isSide(l.orient) && l.symbolLimit == null,
  );
  if (side.length === 0) return spec;
  vg.signals = [
    ...(vg.signals ?? []),
    { name: LEGEND_LIMIT_SIGNAL, value: DEFAULT_LIMIT },
  ];
  for (const l of side) l.symbolLimit = { signal: LEGEND_LIMIT_SIGNAL };
  return spec;
}

/** How far the lowest side legend runs past the chart, and its entry rows. */
function measure(view: View) {
  const root = view.scenegraph() as unknown as {
    root: { items: Array<{ items: SceneMark[] }> };
  };
  let chartBottom = view.height();
  let legend: SceneMark | undefined;
  for (const mark of root.root.items[0]?.items ?? []) {
    if (mark.role !== 'legend') {
      chartBottom = Math.max(chartBottom, mark.bounds.y2);
    } else if (
      isSide(mark.items[0]?.orient) &&
      mark.bounds.y2 > (legend?.bounds.y2 ?? -Infinity)
    ) {
      legend = mark;
    }
  }
  if (!legend) return null;
  // legend → its group → the entry mark → its group → one item per row.
  const entries = legend.items[0]?.items?.find((m) => m.role === 'legend-entry')
    ?.items[0]?.items?.[0];
  return { overflow: legend.bounds.y2 - chartBottom, entries };
}

const basePadding = new WeakMap<View, number>();

/** Fits the view's side legends to it: `grow` pads, otherwise cuts entries. */
export async function fitLegend(view: View, grow: boolean): Promise<void> {
  if (grow) {
    const m = measure(view);
    if (!m) return;
    const padding = view.padding() as { bottom: number };
    if (!basePadding.has(view)) basePadding.set(view, padding.bottom);
    const bottom = basePadding.get(view)! + Math.max(0, Math.ceil(m.overflow));
    if (bottom === padding.bottom) return;
    view.padding({ ...padding, bottom });
    await view.runAsync();
    return;
  }
  // A cut is worked out from the rows' average height, so measure again after
  // it in case the rows that stay are taller.
  for (let i = 0; i < 3; i++) {
    const m = measure(view);
    if (!m?.entries || m.overflow <= 0) return;
    const rows = m.entries.items.length;
    const rowHeight = (m.entries.bounds.y2 - m.entries.bounds.y1) / rows;
    // Two rows at least: one entry and the "…N entries" line.
    const limit = Math.max(2, rows - Math.ceil(m.overflow / rowHeight));
    if (limit >= rows) return;
    view.signal(LEGEND_LIMIT_SIGNAL, limit);
    await view.runAsync();
  }
}
