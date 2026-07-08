import type { Layout, LayoutItem } from 'react-grid-layout';

/**
 * During a live resize, forces one row to a specific height instead of the
 * row's natural `max(h)`. `id` is any card in the target row; `h` is the height
 * to apply to every card in that row. Lets a resize preview grow AND shrink the
 * whole row (shrinking below other cards' heights, which `max` alone can't do).
 */
export interface RowHeightOverride {
  id: string;
  h: number;
}

function sortRowMajor(items: readonly LayoutItem[]): LayoutItem[] {
  return [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

/**
 * Content-equality check across two layouts. Compares (`i`, `x`, `y`, `w`, `h`)
 * for each pair at the same index — used to short-circuit the
 * `setLayoutItems → RGL re-render → compactor → onLayoutChange → setLayoutItems`
 * cycle when the layout's actual content hasn't changed (only its array
 * reference would have).
 */
export function layoutItemsEqual(a: Layout, b: Layout): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.i !== y.i || x.x !== y.x || x.y !== y.y || x.w !== y.w || x.h !== y.h) {
      return false;
    }
  }
  return true;
}

/**
 * Pack an ordered list of items into a row-aligned grid: items flow
 * left-to-right; when the next item won't fit in the current row's remaining
 * horizontal space, the cursor wraps to a new row.
 *
 * Height is a ROW property: every card in a row is given the SAME height — the
 * row's `max(h)` — so a short card stretches to the row instead of leaving
 * whitespace below itself, and the next row starts below that shared height.
 * Width stays per-card (clamped to the column count). Pass an `override` to
 * force one row (the row containing `override.id`) to a specific height instead
 * of its `max` — used for live row resizing (grow and shrink).
 *
 * Example with cols=3 and item heights [1, 2, 1, 1]:
 *   A@(0,0,1,2), B@(1,0,1,2), C@(2,0,1,2), D@(0,2,1,1)
 * A/B/C share row 0 and all take its max height 2; D starts row 1 at y=2.
 */
export function packAllRowMajor(
  ordered: readonly LayoutItem[],
  cols: number,
  override?: RowHeightOverride,
): Layout {
  const safeCols = Math.max(1, Math.floor(cols));
  const out: LayoutItem[] = [];
  let rowStart = 0; // index in `out` where the current row begins
  let rowY = 0;
  let cursorX = 0;
  let rowMaxH = 0;
  let rowOverrideH: number | undefined;

  // Assign every card buffered in the current row its shared height (override
  // if this row was flagged, else the row's max), then advance to the next row.
  const flushRow = () => {
    const rowH = rowOverrideH ?? rowMaxH;
    for (let k = rowStart; k < out.length; k++) out[k].h = rowH;
    rowY += rowH;
    rowStart = out.length;
    cursorX = 0;
    rowMaxH = 0;
    rowOverrideH = undefined;
  };

  for (const item of ordered) {
    const w = Math.max(1, Math.min(item.w, safeCols));
    const h = Math.max(1, item.h);
    if (cursorX + w > safeCols) flushRow();
    // Reset `moved` — it's a transient per-drag flag RGL sets in moveElement.
    // RGL's own compactors clear it; if we let it persist (via `...item`), it
    // accumulates across drag ticks and moveElement's `if (collision.moved)
    // continue` then refuses to push that card out of the dragged item's way,
    // leaving them overlapping (so the drag appears to do nothing). `h` here is
    // provisional — flushRow rewrites it to the row's shared height.
    out.push({ ...item, x: cursorX, y: rowY, w, h, moved: false });
    cursorX += w;
    rowMaxH = Math.max(rowMaxH, h);
    if (override && item.i === override.id) rowOverrideH = Math.max(1, override.h);
  }
  flushRow(); // final row (no-op on empty input)
  return out;
}

/**
 * Canonical layout normal form: sort items into row-major reading order, then
 * pack them tightly into `cols` columns with no gaps. Idempotent — packing an
 * already-packed layout reproduces it exactly (in a packed layout `(y, x)` is a
 * unique key, so `sortRowMajor` is order-independent). This is the single
 * source of truth for the grid's shape: dragging just changes an item's
 * transient position (which changes its sort order), resizing changes its
 * width (or, via `override`, its row's height); re-packing turns either back
 * into a gapless ordered list with uniform row heights.
 */
export function packRowMajor(
  layout: readonly LayoutItem[],
  cols: number,
  override?: RowHeightOverride,
): Layout {
  return packAllRowMajor(sortRowMajor(layout), cols, override);
}

/**
 * Insert a new item at the front of the row-major order and re-pack.
 *
 * Example with `cols=2`:
 *   existing = [A@(0,0,1,9), B@(1,0,1,9)]
 *   repackRowMajor(existing, {i:'C', w:1, h:9, ...}, 2)
 *   → [C@(0,0), A@(1,0), B@(0,9)]
 */
export function repackRowMajor(
  existing: readonly LayoutItem[],
  newItem: LayoutItem,
  cols: number,
): Layout {
  const sorted = sortRowMajor(existing).filter((it) => it.i !== newItem.i);
  return packAllRowMajor([newItem, ...sorted], cols);
}
