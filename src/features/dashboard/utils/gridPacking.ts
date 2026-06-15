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
    out.push({ ...item, x: cursorX, y: rowY, w, h });
    cursorX += w;
    rowMaxH = Math.max(rowMaxH, h);
  }
  return out;
}

/** Axis-aligned rectangle overlap test on integer grid coordinates. */
export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * If a card was dropped onto a single occupant, return a layout where that
 * occupant has been moved to the dragger's pre-drag position — i.e. a
 * swap. Returns `null` when no swap should happen (drop into empty space,
 * or geometry that can't safely swap).
 *
 * The occupant is identified using the PRE-drag layout, not by diffing
 * pre vs post. This is deliberate — if RGL fails to push the occupant
 * out of the way (which is the bug users were hitting), the post-drag
 * layout shows the dragger and occupant overlapping at the same cell.
 * Diffing pre/post would find no moved items and miss the swap. Looking
 * up "who was at the drop target before the drag" works regardless of
 * whether RGL's push pipeline ran.
 *
 * Guards:
 * - exactly one occupant overlapped the target — multi-card overlaps
 *   (e.g. dragging a wide card across two narrow neighbours) skip the
 *   swap and fall through to RGL's natural handling
 * - same w — the occupant gets placed at the dragger's old x; if its
 *   width differs it could overflow the column count, and we don't have
 *   `cols` here to clamp. Equal heights are NOT required: the
 *   row-aligned compactor reflows the rest of the column when the
 *   swapped pair changes the row extents.
 */
export function computeSwap(
  preDragLayout: Layout,
  postDragLayout: Layout,
  oldItem: LayoutItem,
  newItem: LayoutItem,
): Layout | null {
  if (oldItem.x === newItem.x && oldItem.y === newItem.y) return null;

  const draggerId = oldItem.i;
  const preOccupants = preDragLayout.filter(
    (it) =>
      it.i !== draggerId &&
      rectsOverlap(it.x, it.y, it.w, it.h, newItem.x, newItem.y, newItem.w, newItem.h),
  );

  if (preOccupants.length !== 1) return null;

  const occupant = preOccupants[0];
  if (oldItem.w !== occupant.w) return null;

  return postDragLayout.map((it) =>
    it.i === occupant.i ? { ...it, x: oldItem.x, y: oldItem.y } : it,
  );
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
 * Bento-style row-aligned compaction. After any drag / resize, items are
 * regrouped into rows so that:
 *   1. every item in a row shares the same top y, and
 *   2. row N+1 starts at row N's max-bottom (no vertical gaps).
 *
 * Two items join the same row when their (pre-compaction) y-ranges overlap
 * AND their x-ranges don't conflict. If their x-ranges DO conflict — both
 * cards want the same column at overlapping y — the second one falls into
 * a new row below, since two items can't occupy the same cell.
 *
 * Why this matters: RGL's default `verticalCompactor` packs each column
 * independently (Masonry), so when a grown card in column 0 pushes its
 * neighbour down, the sibling card in column 1 stays put — leaving the
 * two now-misaligned across columns. This compactor instead recognises
 * the pushed and not-pushed cards as belonging to the same logical row
 * and snaps them to the same y. Cross-column row baselines stay intact
 * even after partial reflows.
 *
 * Trade-off: mid-row drops into an already-occupied column push to a new
 * row — strict row alignment doesn't admit items at sub-positions within
 * a row. A user dropping into an empty mid-row CELL (same row, free
 * column) joins that row as expected.
 */
export function compactRowAligned(layout: Layout): Layout {
  if (layout.length === 0) return [];

  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

  const xConflicts = (item: LayoutItem, group: readonly LayoutItem[]): boolean =>
    group.some((g) => item.x < g.x + g.w && g.x < item.x + item.w);

  const groups: LayoutItem[][] = [];
  let currentGroup: LayoutItem[] = [];
  let currentGroupOrigBottom = -Infinity;

  for (const item of sorted) {
    const yOverlaps = item.y < currentGroupOrigBottom;
    const canJoin = currentGroup.length > 0 && yOverlaps && !xConflicts(item, currentGroup);
    if (canJoin) {
      currentGroup.push(item);
      currentGroupOrigBottom = Math.max(currentGroupOrigBottom, item.y + item.h);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [item];
      currentGroupOrigBottom = item.y + item.h;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  const yByItem = new Map<string, number>();
  let nextRowTop = 0;
  for (const group of groups) {
    const extent = Math.max(...group.map((it) => it.h));
    for (const item of group) {
      yByItem.set(item.i, nextRowTop);
    }
    nextRowTop += extent;
  }

  return layout.map((item) => ({ ...item, y: yByItem.get(item.i) ?? item.y }));
}

export const rowAlignedCompactor: Compactor = {
  type: 'vertical',
  allowOverlap: false,
  compact: (layout) => compactRowAligned(layout),
};
