// Value labels for a pie or donut chart: each slice's count and share,
// "14 (67%)". A pie's labels sit inside its slices. A donut's ring is too thin
// to hold them, so they sit just outside it, on the side of the ring they face,
// and the ring shrinks when the plot is too narrow to fit them beside it.

/** A Vega-Lite unit layer, as convertToVegaSpec builds them. */
export interface VlLayer {
  mark: { type: string } & Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encoding: Record<string, any>;
  transform?: object[];
}

export interface ArcLabelOptions {
  /** Colour of a donut's labels, which sit on the chart background. */
  textColor?: string;
  /** The text marks' font size, which a donut makes room for. */
  fontSize?: number;
  /** The chart's rows, whose largest value sets that room. */
  rows?: Record<string, unknown>[];
}

// ponytail: slices under 5% go unlabelled, because neighbouring labels would
// overlap. Add real collision avoidance if that hides labels people need.
const MIN_SHARE = 0.05;
const TOTAL = 'udi_arc_total';
/** Pixels between a donut's ring and its labels. */
const RING_GAP = 6;
/** The smallest a donut shrinks to, in pixels of outer radius. */
const MIN_RING = 30;
// ponytail: a label's width is estimated, not measured, at this many ems a
// character (digits are ~0.55em in a sans-serif, punctuation less), so a ring
// shrinks a little more than it must. Measure the rendered text if that shows.
const CHAR_EM = 0.55;
/** The legibility halo of a label drawn over a slice (see test/text-outline.mjs). */
const HALO = { stroke: 'white', strokeWidth: 3, strokeOpacity: 0.8 };

/**
 * The chart's layers, with value labels added when it is a single pie or donut
 * whose slices are sized by one field and coloured by another; unchanged
 * otherwise. A pie's labels are dark with a white halo, so they read on any
 * slice colour.
 */
export function withArcLabels(
  layers: VlLayer[],
  { textColor = 'black', fontSize = 11, rows = [] }: ArcLabelOptions = {},
): VlLayer[] {
  const arcs = layers.filter((l) => l.mark.type === 'arc');
  // The rings of a multi-layer chart would label over each other.
  if (arcs.length !== 1) return layers;
  const arc = arcs[0];
  const { theta, color, radius, radius2, opacity } = arc.encoding;
  if (!theta?.field || !color?.field) return layers;
  // A slice whose radius is a field (a rose chart) doesn't show a share.
  if (radius?.field || radius2?.field) return layers;

  // Vega-Lite escapes dots in a field name and names its stacked extents after
  // the unescaped name.
  const field = String(theta.field).replace(/\\(.)/g, '$1');
  const datum = (name: string) => `datum[${JSON.stringify(name)}]`;
  const value = datum(field);
  const share = `${value} / datum.${TOTAL}`;
  const percent = `format(${share}, '.0%')`;
  const count = `(${value} == floor(${value}) ? format(${value}, ',') : format(${value}, ',.2~f'))`;
  // A frequency rollup's values are shares already, so they show once.
  const text =
    `${share} < ${MIN_SHARE} ? '' : ` +
    `abs(datum.${TOTAL} - 1) < 1e-9 ? ${percent} : ${count} + ' (' + ${percent} + ')'`;

  const label = (mark: Record<string, unknown>): VlLayer => ({
    mark: { type: 'text', tooltip: true, text: { expr: text }, ...mark },
    transform: [
      { joinaggregate: [{ op: 'sum', field: theta.field, as: TOTAL }] },
    ],
    // The arc layer's own theta and colour put each label in its slice's stack
    // slot, colour ordering that stack by its scale domain. The text has to stay
    // out of the encoding: as a field, it would join the stack order too.
    encoding: { theta: { ...theta, stack: true }, color, opacity },
  });

  if (radius2?.value == null) {
    // A pie's outer radius: its own, or Vega-Lite's default of half the plot.
    const inside =
      radius?.value != null
        ? Number(radius.value) * 0.6
        : { expr: 'min(width, height) * 0.3' };
    return [
      ...layers,
      label({ fill: 'black', radius: inside, ...HALO }),
      label({ fill: 'black', radius: inside }),
    ];
  }

  // A donut keeps its ring's size when the plot has room for the widest label
  // on either side of it, and shrinks, keeping its thickness, when not.
  const values = rows.map((r) => Math.abs(Number(r[field])) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  const widest = Math.max(0, ...values);
  const chars =
    Math.abs(total - 1) < 1e-9
      ? '100%'.length
      : (Number.isInteger(widest)
          ? widest.toLocaleString('en-US')
          : widest.toFixed(2)
        ).length + ' (00%)'.length;
  const room = RING_GAP + chars * CHAR_EM * fontSize;
  const given = Math.max(Number(radius?.value ?? 0), Number(radius2.value));
  const hole = Math.min(Number(radius?.value ?? 0), Number(radius2.value));
  const outer =
    `max(${MIN_RING}, min(${given}, width / 2 - ${room}, ` +
    `height / 2 - ${RING_GAP + fontSize}))`;
  const { radius: _r, radius2: _r2, ...arcEncoding } = arc.encoding;
  const sized: VlLayer = {
    ...arc,
    mark: {
      ...arc.mark,
      outerRadius: { expr: outer },
      innerRadius: { expr: `${outer} * ${hole / given}` },
    },
    encoding: arcEncoding,
  };
  // The slice's middle angle, clockwise from 12 o'clock: labels on the right
  // half start at their anchor, the left half's end there.
  const angle = `PI * (${datum(`${field}_start`)} + ${datum(`${field}_end`)}) / datum.${TOTAL}`;
  return [
    ...layers.map((l) => (l === arc ? sized : l)),
    label({
      fill: textColor,
      radius: { expr: `${outer} + ${RING_GAP}` },
      align: { expr: `sin(${angle}) >= 0 ? 'left' : 'right'` },
    }),
  ];
}
