import { describe, expect, it } from 'vitest';
import type { LayoutItem } from 'react-grid-layout';
import {
  TALL_CARD_RATIO,
  layoutItemsEqual,
  packAllRowMajor,
  packRowMajor,
  repackRowMajor,
  widenTallItems,
} from './gridPacking';

function item(i: string, w = 1, h = 1): LayoutItem {
  return { i, x: 0, y: 0, w, h };
}

describe('repackRowMajor', () => {
  it('places the new item alone when existing is empty', () => {
    const out = repackRowMajor([], item('C'), 2);
    expect(out).toEqual([{ i: 'C', x: 0, y: 0, w: 1, h: 1, moved: false }]);
  });

  it('matches the A/B/C user example with cols=2', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 9 },
      { i: 'B', x: 1, y: 0, w: 1, h: 9 },
    ];
    const out = repackRowMajor(existing, { i: 'C', x: 0, y: 0, w: 1, h: 9 }, 2);
    expect(out.map((it) => ({ i: it.i, x: it.x, y: it.y }))).toEqual([
      { i: 'C', x: 0, y: 0 },
      { i: 'A', x: 1, y: 0 },
      { i: 'B', x: 0, y: 9 },
    ]);
  });

  it('preserves each item width and extra props; normalizes height per row', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 2, h: 4, minH: 3 },
      { i: 'B', x: 0, y: 4, w: 1, h: 2 },
    ];
    // Prepends C → row 0 = C(w1,h5) + A(w2,h4), row max 5; B alone on row 1.
    const out = repackRowMajor(existing, { i: 'C', x: 0, y: 0, w: 1, h: 5 }, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.C.w).toBe(1);
    expect(byId.A.w).toBe(2);
    expect(byId.A.minH).toBe(3); // extra props survive the repack
    expect(byId.C.h).toBe(5);
    expect(byId.A.h).toBe(5); // normalized up from 4 to the row max
    expect(byId.B.w).toBe(1);
    expect(byId.B.h).toBe(2); // alone on its row → keeps its own height
  });

  it('clamps an oversized item width to the column count', () => {
    const out = repackRowMajor([], { i: 'X', x: 0, y: 0, w: 5, h: 2 }, 2);
    expect(out[0].w).toBe(2);
  });

  it('deduplicates by id (newItem replaces an existing entry with same i)', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 1, h: 2 },
    ];
    const out = repackRowMajor(existing, { i: 'A', x: 0, y: 0, w: 2, h: 3 }, 3);
    const aEntries = out.filter((it) => it.i === 'A');
    expect(aEntries).toHaveLength(1);
    expect(aEntries[0].w).toBe(2);
    expect(aEntries[0].h).toBe(3);
  });

  it('treats existing positions as row-major reading order on repack', () => {
    // Visually:   D(col 0 row 0)   B(col 1 row 0)
    //             A(col 0 row 1)   C(col 1 row 1)
    // Reading order is D, B, A, C → insert E at front → E, D, B, A, C
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 1, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
      { i: 'C', x: 1, y: 1, w: 1, h: 1 },
      { i: 'D', x: 0, y: 0, w: 1, h: 1 },
    ];
    const out = repackRowMajor(existing, { i: 'E', x: 0, y: 0, w: 1, h: 1 }, 2);
    const order = [...out].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y)).map((it) => it.i);
    expect(order).toEqual(['E', 'D', 'B', 'A', 'C']);
  });
});

describe('packAllRowMajor', () => {
  it('packs an ordered list into row-major positions', () => {
    const ordered = [item('A'), item('B'), item('C'), item('D'), item('E')];
    const out = packAllRowMajor(ordered, 2);
    expect(out.map((it) => ({ i: it.i, x: it.x, y: it.y }))).toEqual([
      { i: 'A', x: 0, y: 0 },
      { i: 'B', x: 1, y: 0 },
      { i: 'C', x: 0, y: 1 },
      { i: 'D', x: 1, y: 1 },
      { i: 'E', x: 0, y: 2 },
    ]);
  });

  it('normalizes every card in a row to the row max; next row starts below it', () => {
    // cols=3, item heights [1, 2, 1, 1]. A, B, C share row 0, whose height is
    // the max (2) — so A and C are normalized up from 1 to 2 (uniform row).
    // D wraps to row 1 at y=2 (below the shared row-0 height) at its own h=1.
    const ordered: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 0, y: 0, w: 1, h: 2 },
      { i: 'C', x: 0, y: 0, w: 1, h: 1 },
      { i: 'D', x: 0, y: 0, w: 1, h: 1 },
    ];
    const out = packAllRowMajor(ordered, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A).toEqual(expect.objectContaining({ x: 0, y: 0, h: 2 }));
    expect(byId.B).toEqual(expect.objectContaining({ x: 1, y: 0, h: 2 }));
    expect(byId.C).toEqual(expect.objectContaining({ x: 2, y: 0, h: 2 }));
    expect(byId.D).toEqual(expect.objectContaining({ x: 0, y: 2, h: 1 }));
  });

  it('returns an empty array for empty input', () => {
    expect(packAllRowMajor([], 3)).toEqual([]);
  });
});

describe('packRowMajor', () => {
  it('is idempotent — packing an already-packed layout reproduces it', () => {
    const packed: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 2, h: 1 }, // row 0 full (1 + 2 = cols)
      { i: 'C', x: 0, y: 2, w: 1, h: 1 }, // row 1 (below the row-0 height 2)
    ];
    const once = packRowMajor(packed, 3);
    // Row 0 (A + B) normalizes to its max height 2 — B grows 1→2; positions hold.
    expect(once.map((it) => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h }))).toEqual([
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 2, h: 2 },
      { i: 'C', x: 0, y: 2, w: 1, h: 1 },
    ]);
    // Packing again produces an identical array.
    expect(packRowMajor(once, 3)).toEqual(once);
  });

  it('reorders by position: an item dropped mid-row lands at that slot; overflow wraps', () => {
    // Row A,B,C at cols=3 with D dropped between A and B (x=1). RGL's
    // horizontal push has already shifted B,C right → x order A(0) D(1) B(2)
    // C(3). Packing by (y, x) inserts D and wraps the overflow to a new row.
    const dragged: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'D', x: 1, y: 0, w: 1, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
      { i: 'C', x: 3, y: 0, w: 1, h: 1 },
    ];
    const out = packRowMajor(dragged, 3);
    expect(out.map((it) => ({ i: it.i, x: it.x, y: it.y }))).toEqual([
      { i: 'A', x: 0, y: 0 },
      { i: 'D', x: 1, y: 0 },
      { i: 'B', x: 2, y: 0 },
      { i: 'C', x: 0, y: 1 }, // row was full → wraps
    ]);
  });

  it('closes gaps: a sparse, out-of-order layout packs into a contiguous list', () => {
    const sparse: LayoutItem[] = [
      { i: 'C', x: 2, y: 5, w: 1, h: 1 }, // stray far below
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 }, // hole at x=1 in row 0
    ];
    const out = packRowMajor(sparse, 3);
    // Reading order by (y, x) is A, B, C → packed with no empty columns.
    expect(out.map((it) => ({ i: it.i, x: it.x, y: it.y }))).toEqual([
      { i: 'A', x: 0, y: 0 },
      { i: 'B', x: 1, y: 0 },
      { i: 'C', x: 2, y: 0 },
    ]);
  });
});

describe('row height (uniform + override)', () => {
  it('auto-grows a row when a taller card joins it', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 3 },
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
    ];
    // Prepend a taller card (within TALL_CARD_RATIO); cols=3 → all three
    // share row 0, which grows to 5.
    const out = repackRowMajor(existing, { i: 'C', x: 0, y: 0, w: 1, h: 5 }, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.h).toBe(5);
    expect(byId.B.h).toBe(5);
    expect(byId.C.h).toBe(5);
  });

  it('gives a new card far taller than its row a row of its own', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 7 },
      { i: 'B', x: 1, y: 0, w: 1, h: 7 },
    ];
    // 41 rows beside 7-row cards: full width, and A/B keep their height below it.
    const out = repackRowMajor(existing, { i: 'C', x: 0, y: 0, w: 1, h: 41 }, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.C).toMatchObject({ x: 0, y: 0, w: 3, h: 41 });
    expect(byId.A).toMatchObject({ y: 41, h: 7 });
    expect(byId.B).toMatchObject({ y: 41, h: 7 });
  });

  it('override grows the whole row (all cards, any width) and leaves other rows alone', () => {
    const ordered: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 0, y: 0, w: 2, h: 2 }, // row 0 (1 + 2 = cols)
      { i: 'C', x: 0, y: 0, w: 1, h: 2 }, // row 1
    ];
    const out = packAllRowMajor(ordered, 3, { id: 'A', h: 6 });
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.h).toBe(6);
    expect(byId.B.h).toBe(6); // whole row 0 grows, incl. the wide card
    expect(byId.C).toEqual(expect.objectContaining({ y: 6, h: 2 })); // row 1 below, unaffected
  });

  it('override shrinks a row below its other cards (override beats max)', () => {
    const ordered: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 10 },
      { i: 'B', x: 1, y: 0, w: 1, h: 5 },
    ];
    // Override the row (targeting B) to 3, below A's natural 10.
    const out = packAllRowMajor(ordered, 3, { id: 'B', h: 3 });
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.h).toBe(3);
    expect(byId.B.h).toBe(3);
  });

  it('is stable after an override commit: re-packing with no override is a no-op', () => {
    const ordered: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 10 },
      { i: 'B', x: 1, y: 0, w: 1, h: 5 },
    ];
    const committed = packAllRowMajor(ordered, 3, { id: 'B', h: 3 }); // both → 3
    const repacked = packRowMajor(committed, 3); // no override → max = 3 (all equal)
    expect(repacked).toEqual(committed);
  });
});

describe('layoutItemsEqual', () => {
  it('is true for the same reference', () => {
    const a: LayoutItem[] = [{ i: 'A', x: 0, y: 0, w: 1, h: 1 }];
    expect(layoutItemsEqual(a, a)).toBe(true);
  });

  it('is true for arrays with identical (i, x, y, w, h) at each index', () => {
    const a: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 2 },
    ];
    const b: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1, minW: 1 }, // extra prop ignored
      { i: 'B', x: 1, y: 0, w: 1, h: 2 },
    ];
    expect(layoutItemsEqual(a, b)).toBe(true);
  });

  it('is false when any coordinate differs', () => {
    const a: LayoutItem[] = [{ i: 'A', x: 0, y: 0, w: 1, h: 1 }];
    const b: LayoutItem[] = [{ i: 'A', x: 0, y: 1, w: 1, h: 1 }];
    expect(layoutItemsEqual(a, b)).toBe(false);
  });

  it('is false for different lengths', () => {
    const a: LayoutItem[] = [{ i: 'A', x: 0, y: 0, w: 1, h: 1 }];
    const b: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
    ];
    expect(layoutItemsEqual(a, b)).toBe(false);
  });
});

describe('widenTallItems', () => {
  const widths = (items: LayoutItem[]) => Object.fromEntries(items.map((it) => [it.i, it.w]));

  it('widens only the listed cards, and only past TALL_CARD_RATIO', () => {
    // N is exactly at the ratio to A, the shortest beside it: stays.
    const atRatio = [item('N', 1, 7 * TALL_CARD_RATIO), item('A', 1, 7), item('B', 1, 9)];
    expect(widths(widenTallItems(atRatio, 3, new Set(['N'])))).toEqual({ N: 1, A: 1, B: 1 });
    // Past it, but not listed: stays.
    const past = [item('M', 1, 30), item('A', 1, 7), item('B', 1, 9)];
    expect(widths(widenTallItems(past, 3, new Set(['A'])))).toEqual({ M: 1, A: 1, B: 1 });
    // Listed: full width.
    expect(widths(widenTallItems(past, 3, new Set(['M'])))).toEqual({ M: 3, A: 1, B: 1 });
  });

  it('measures a lone card against the reference height', () => {
    expect(widths(widenTallItems([item('T', 1, 41)], 3, new Set(['T']), 7))).toEqual({ T: 3 });
    expect(widths(widenTallItems([item('S', 1, 10)], 3, new Set(['S']), 7))).toEqual({ S: 1 });
  });

  it('leaves a one-column grid alone', () => {
    expect(widths(widenTallItems([item('T', 1, 41), item('A', 1, 7)], 1, new Set(['T'])))).toEqual({
      T: 1,
      A: 1,
    });
  });

  it('two tall cards beside a short one each get a row', () => {
    // Measured against the tallest, T1 and T2 would vouch for each other and
    // still stretch A to 40. T1 widens; T2 then lands beside A and B on the
    // next row, and widens too.
    const ordered = [item('T1', 1, 40), item('T2', 1, 40), item('A', 1, 7), item('B', 1, 7)];
    const out = packAllRowMajor(widenTallItems(ordered, 3, new Set(['T1', 'T2'])), 3);
    expect(out.map((it) => [it.i, it.y, it.w, it.h])).toEqual([
      ['T1', 0, 3, 40],
      ['T2', 40, 3, 40],
      ['A', 80, 1, 7],
      ['B', 80, 1, 7],
    ]);
  });

  it('leaves two tall cards that only share a row with each other', () => {
    const out = widenTallItems([item('T1', 1, 40), item('T2', 1, 38)], 2, new Set(['T1', 'T2']));
    expect(widths(out)).toEqual({ T1: 1, T2: 1 });
  });
});
