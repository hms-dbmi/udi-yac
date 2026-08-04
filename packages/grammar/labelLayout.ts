/**
 * Keeping text labels from drawing on top of each other.
 *
 * A text mark draws exactly where its encoding says, so two labels whose values
 * coincide — two survival curves ending at the same percentage, two bars of equal
 * height — land on the same point and become unreadable. Neither vega-lite nor the
 * UDI grammar has a notion of label layout, so a layer that opts into
 * `avoidOverlap` gets its positions adjusted here before the spec is compiled.
 */

/** A row of the (already transformed) dataset a chart draws from. */
export type LabelRow = Record<string, unknown>;

/**
 * Spread out rows whose `positionField` values sit closer together than `minGap`.
 *
 * Returns the adjusted positions in `outField` on each row, leaving every other
 * field untouched. Rows the layer would not draw anyway — a null/non-finite
 * position, or a null `requiredField` (which is how a template suppresses a label)
 * — get `null`, which vega-lite drops.
 *
 * The gap is in *data units*, not pixels: at spec-build time the plot's pixel
 * height is not known (it may be `container`-sized), and a caller who knows the
 * axis runs 0..100 does know what separation means on it.
 *
 * Positions are nudged in one ascending pass and then, if the cluster has been
 * pushed past `limit.max`, shifted back down as a whole. When there is genuinely
 * not enough room for every label the excess stays overlapped rather than being
 * pushed off the axis — a squashed label is recoverable, one drawn outside the
 * plot is not.
 */
export function spreadLabels(
  rows: LabelRow[],
  {
    positionField,
    outField,
    minGap,
    requiredField,
    limit,
  }: {
    positionField: string;
    outField: string;
    minGap: number;
    requiredField?: string | undefined;
    limit?: { min?: number | undefined; max?: number | undefined } | undefined;
  },
): void {
  const drawable: { row: LabelRow; position: number }[] = [];

  for (const row of rows) {
    row[outField] = null;
    const position = row[positionField];
    const required = requiredField === undefined ? 0 : row[requiredField];
    if (typeof position !== 'number' || !Number.isFinite(position)) continue;
    if (required === null || required === undefined) continue;
    drawable.push({ row, position });
  }

  if (drawable.length === 0) return;

  // Ascending, so the pass below only ever pushes a label further up.
  drawable.sort((a, b) => a.position - b.position);

  let previous = -Infinity;
  for (const entry of drawable) {
    const adjusted = Math.max(entry.position, previous + minGap);
    entry.position = adjusted;
    previous = adjusted;
  }

  // The pass above can push the topmost label past the end of the axis. Move the
  // whole cluster down by the overflow rather than clamping, which would just
  // re-stack them at the top.
  const max = limit?.max;
  const min = limit?.min;
  if (max !== undefined) {
    const overflow = previous - max;
    if (overflow > 0) {
      const room = min === undefined ? overflow : drawable[0].position - min;
      const shift = Math.min(overflow, Math.max(room, 0));
      for (const entry of drawable) entry.position -= shift;
    }
  }

  for (const entry of drawable) {
    // Whatever could not be resolved stays inside the plot: labels that end up
    // stacked are still readable one at a time, labels outside the axis are not
    // drawn at all.
    let position = entry.position;
    if (max !== undefined) position = Math.min(position, max);
    if (min !== undefined) position = Math.max(position, min);
    entry.row[outField] = position;
  }
}

/**
 * The minimum separation a `avoidOverlap: true` layer gets: a fraction of the
 * axis it is placed on, chosen so a default-sized label clears its neighbour at
 * the chart sizes these specs are drawn at.
 */
export const DEFAULT_LABEL_GAP_FRACTION = 0.05;
