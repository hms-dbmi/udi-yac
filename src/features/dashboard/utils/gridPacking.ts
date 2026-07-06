import type { Compactor, Layout, LayoutItem } from 'react-grid-layout';

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
 * left-to-right; when the next item won't fit in the current row's
 * remaining horizontal space, the cursor wraps to a new row whose `y`
 * starts at the previous row's `max(h)`. Items keep their individual
 * `h` — short cards leave empty space below themselves, but the next
 * row always begins below the tallest card.
 *
 * This deliberately differs from a Masonry / cell-occupancy packing
 * (where a short card lets later cards slip into the gap below it).
 *
 * Example with cols=3 and item heights [1, 2, 1, 1]:
 *   A@(0,0,1,1), B@(1,0,1,2), C@(2,0,1,1), D@(0,2,1,1)
 * The fourth item lands at y=2 (below B's bottom), not y=1.
 */
export function packAllRowMajor(ordered: readonly LayoutItem[], cols: number): Layout {
  const safeCols = Math.max(1, Math.floor(cols));
  let cursorX = 0;
  let rowY = 0;
  let rowMaxH = 0;
  const out: LayoutItem[] = [];
  for (const item of ordered) {
    const w = Math.max(1, Math.min(item.w, safeCols));
    const h = Math.max(1, item.h);
    if (cursorX + w > safeCols) {
      rowY += rowMaxH;
      rowMaxH = 0;
      cursorX = 0;
    }
    // Reset `moved` — it's a transient per-drag flag RGL sets in moveElement.
    // RGL's own compactors clear it; if we let it persist (via `...item`), it
    // accumulates across drag ticks and moveElement's `if (collision.moved)
    // continue` then refuses to push that card out of the dragged item's way,
    // leaving them overlapping (so the drag appears to do nothing).
    out.push({ ...item, x: cursorX, y: rowY, w, h, moved: false });
    cursorX += w;
    rowMaxH = Math.max(rowMaxH, h);
  }
  return out;
}

/**
 * Canonical layout normal form: sort items into row-major reading order, then
 * pack them tightly into `cols` columns with no gaps. Idempotent — packing an
 * already-packed layout reproduces it exactly (in a packed layout `(y, x)` is a
 * unique key, so `sortRowMajor` is order-independent). This is the single
 * source of truth for the grid's shape: dragging just changes an item's
 * transient position (which changes its sort order), resizing changes its
 * width; re-packing turns either back into a gapless ordered list.
 */
export function packRowMajor(layout: readonly LayoutItem[], cols: number): Layout {
  return packAllRowMajor(sortRowMajor(layout), cols);
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

/**
 * RGL compactor that keeps the grid as a gapless, ordered list packed into the
 * current column count. RGL runs `compact(layout, cols)` after every drag,
 * resize, and prop sync, so the layout is always the normal form — no gaps, no
 * free-form holes. Because RGL computes the live drag preview and the drop with
 * this same function, the preview matches the drop by construction.
 *
 * `type: 'horizontal'` only affects how RGL's `moveElement` displaces the
 * hovered neighbours during a drag (it cascades them right, which — after we
 * re-sort by (y, x) and pack — reads as "insert at the hovered slot, shift the
 * rest right, wrap when the row is full"). It never changes the final geometry,
 * since we fully override `compact`.
 */
export const listPackCompactor: Compactor = {
  type: 'horizontal',
  allowOverlap: false,
  compact: (layout, cols) => packRowMajor(layout, cols),
};
