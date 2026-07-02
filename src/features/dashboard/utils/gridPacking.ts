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

/** Lay a row's items out left-to-right at a fixed `y`, packing `x` from 0 by
 * cumulative width so the row is gapless and non-overlapping. `members` order
 * is preserved (callers sort first if they need a specific order). */
function relayRow(members: readonly LayoutItem[], y: number): LayoutItem[] {
  let x = 0;
  return members.map((m) => {
    const laid = { ...m, x, y };
    x += Math.max(1, m.w);
    return laid;
  });
}

/**
 * Drag-to-reorder with push-back-in-row semantics. When a card is dropped onto
 * a row, the dragger is inserted at the drop position and the row's other cards
 * are shifted sideways to make room — they stay in their row. A card only
 * reflows to a new row when the target row is too full to hold everyone.
 *
 * This replaces the old 1:1 swap (which teleported the displaced card to
 * wherever the dragger came from — often a different row).
 *
 * The target row is the row whose vertical band contains the drop's top edge.
 * Rows are keyed by `y` and span `[y, y + max(h in row))`. We match by band
 * rather than by the dragged rect overlapping a specific card: RGL reports the
 * drop `y` in grid units that don't reliably land on a row top (rows aren't
 * uniform height), and a tall card's drop rect easily dips into the next row's
 * band — an overlap test would then see cards in two rows and bail, letting RGL
 * push the displaced card down even when the target row had room.
 *
 * Returns `null` (→ fall through to RGL + the row-aligned compactor) when there
 * are no other cards to reorder against, the dragger didn't move, or the drop
 * landed below every row (RGL then opens a fresh row, as expected).
 *
 * Invariant: every row this returns is gapless and non-overlapping in `x`, so
 * the downstream `compactRowAligned` (which bumps x-conflicting same-row items
 * to a new row) is a no-op on the rows we built.
 */
export function computeReorder(
  preDragLayout: Layout,
  oldItem: LayoutItem,
  newItem: LayoutItem,
  cols: number,
): Layout | null {
  if (oldItem.x === newItem.x && oldItem.y === newItem.y) return null;

  const draggerId = oldItem.i;
  const dragger = preDragLayout.find((it) => it.i === draggerId);
  if (!dragger) return null;

  const others = preDragLayout.filter((it) => it.i !== draggerId);
  if (others.length === 0) return null;

  const rowTops = [...new Set(others.map((it) => it.y))].sort((a, b) => a - b);
  let matched: number | null = null;
  for (const t of rowTops) {
    const extent = Math.max(...others.filter((it) => it.y === t).map((it) => it.h));
    if (newItem.y < t + extent) {
      matched = t;
      break;
    }
  }
  if (matched === null) return null; // dropped below every row → let RGL open a new one
  const targetY = matched;

  const safeCols = Math.max(1, Math.floor(cols));
  const clampW = (w: number) => Math.max(1, Math.min(w, safeCols));

  // Insertion index: compare the drop x against the target members' GAPLESS
  // positions (their x once the dragger's old gap is closed), not their
  // current x — otherwise a same-row rightward drag lands off-by-one.
  const targetMembers = others.filter((it) => it.y === targetY).sort((a, b) => a.x - b.x);
  let acc = 0;
  let insertAt = 0;
  for (const m of targetMembers) {
    if (acc >= newItem.x) break;
    insertAt++;
    acc += clampW(m.w);
  }
  const newRow = [...targetMembers.slice(0, insertAt), dragger, ...targetMembers.slice(insertAt)];
  const totalW = newRow.reduce((sum, it) => sum + clampW(it.w), 0);

  if (totalW <= safeCols) {
    // Fits: only the target row (shift to make room) and the source row (close
    // the gap the dragger left) change; every other row is untouched.
    const laid = new Map<string, LayoutItem>();
    for (const it of relayRow(newRow, targetY)) laid.set(it.i, it);
    if (oldItem.y !== targetY) {
      const sourceMembers = others.filter((it) => it.y === oldItem.y).sort((a, b) => a.x - b.x);
      for (const it of relayRow(sourceMembers, oldItem.y)) laid.set(it.i, it);
    }
    return preDragLayout.map((it) => laid.get(it.i) ?? it);
  }

  // Too full: reflow. Rows ABOVE the target stay put (the source row's gap, if
  // the dragger came from above, is still closed). The target row and every row
  // below it repack row-major and shift down to sit just below the kept rows.
  const below = others
    .filter((it) => it.y > targetY)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const repacked = new Map<string, LayoutItem>();
  for (const it of packAllRowMajor([...newRow, ...below], safeCols)) {
    repacked.set(it.i, { ...it, y: it.y + targetY });
  }
  const sourceAboveClosed = new Map<string, LayoutItem>();
  if (oldItem.y < targetY) {
    const sourceMembers = others.filter((it) => it.y === oldItem.y).sort((a, b) => a.x - b.x);
    for (const it of relayRow(sourceMembers, oldItem.y)) sourceAboveClosed.set(it.i, it);
  }
  return preDragLayout.map((it) => repacked.get(it.i) ?? sourceAboveClosed.get(it.i) ?? it);
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
  // 'horizontal' makes RGL's live drag preview push a displaced card sideways
  // into the next column (matching computeReorder's push-back-in-row drop),
  // instead of 'vertical' which previews it dropping a row down and then snaps
  // back on release. `type` only drives moveElement's collision push during
  // drag + x-origin resizes ('w'/'sw'); pure height/east resizes and the final
  // compaction (compactRowAligned below) are unaffected. The authoritative drop
  // is still computeReorder — this only aligns the live preview with it.
  type: 'horizontal',
  allowOverlap: false,
  compact: (layout) => compactRowAligned(layout),
};
