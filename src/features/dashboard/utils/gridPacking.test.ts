import { describe, expect, it } from 'vitest';
import type { LayoutItem } from 'react-grid-layout';
import {
  compactRowAligned,
  computeSwap,
  layoutItemsEqual,
  packAllRowMajor,
  rectsOverlap,
  repackRowMajor,
} from './gridPacking';

function item(i: string, w = 1, h = 1): LayoutItem {
  return { i, x: 0, y: 0, w, h };
}

describe('repackRowMajor', () => {
  it('places the new item alone when existing is empty', () => {
    const out = repackRowMajor([], item('C'), 2);
    expect(out).toEqual([{ i: 'C', x: 0, y: 0, w: 1, h: 1 }]);
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

  it('preserves each item w/h after repacking', () => {
    const existing: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 2, h: 4, minH: 3 },
      { i: 'B', x: 0, y: 4, w: 1, h: 2 },
    ];
    const out = repackRowMajor(existing, { i: 'C', x: 0, y: 0, w: 1, h: 5 }, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.w).toBe(2);
    expect(byId.A.h).toBe(4);
    expect(byId.A.minH).toBe(3);
    expect(byId.B.w).toBe(1);
    expect(byId.B.h).toBe(2);
    expect(byId.C.w).toBe(1);
    expect(byId.C.h).toBe(5);
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

  it('row-aligns: next row starts after the tallest item in the current row', () => {
    // cols=3, item heights [1, 2, 1, 1]. The fourth item should land at
    // (0, 2) — start of a new row BELOW the h=2 second item — rather than
    // (0, 1) where a Masonry packer would slip it into row 0's gap below
    // the h=1 first item.
    const ordered: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 0, y: 0, w: 1, h: 2 },
      { i: 'C', x: 0, y: 0, w: 1, h: 1 },
      { i: 'D', x: 0, y: 0, w: 1, h: 1 },
    ];
    const out = packAllRowMajor(ordered, 3);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A).toEqual(expect.objectContaining({ x: 0, y: 0, h: 1 }));
    expect(byId.B).toEqual(expect.objectContaining({ x: 1, y: 0, h: 2 }));
    expect(byId.C).toEqual(expect.objectContaining({ x: 2, y: 0, h: 1 }));
    expect(byId.D).toEqual(expect.objectContaining({ x: 0, y: 2, h: 1 }));
  });

  it('returns an empty array for empty input', () => {
    expect(packAllRowMajor([], 3)).toEqual([]);
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

describe('rectsOverlap', () => {
  it('detects axis-aligned overlap on integer cells', () => {
    expect(rectsOverlap(0, 0, 1, 1, 0, 0, 1, 1)).toBe(true);
    expect(rectsOverlap(0, 0, 2, 2, 1, 1, 1, 1)).toBe(true);
  });

  it('treats edge-touching as NOT overlapping (half-open intervals)', () => {
    expect(rectsOverlap(0, 0, 1, 1, 1, 0, 1, 1)).toBe(false); // touching at x=1
    expect(rectsOverlap(0, 0, 1, 1, 0, 1, 1, 1)).toBe(false); // touching at y=1
  });
});

describe('computeSwap', () => {
  it("swaps when RGL didn't push the occupant (overlap in post layout)", () => {
    // The bug we're fixing: user drops A onto B, RGL leaves both at the
    // same cell. The occupant is identified by who was at the target
    // PRE-drag, so this works even when RGL's push pipeline didn't fire.
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 1, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 }, // overlapping — RGL did not push
    ];
    const oldItem: LayoutItem = { i: 'A', x: 0, y: 0, w: 1, h: 1 };
    const newItem: LayoutItem = { i: 'A', x: 1, y: 0, w: 1, h: 1 };
    const swapped = computeSwap(preDrag, postDrag, oldItem, newItem);
    expect(swapped).not.toBeNull();
    const byId = Object.fromEntries(swapped!.map((it) => [it.i, it]));
    expect(byId.A).toEqual(expect.objectContaining({ x: 1, y: 0 }));
    expect(byId.B).toEqual(expect.objectContaining({ x: 0, y: 0 }));
  });

  it('swaps when RGL did push the occupant (occupant moved away from target)', () => {
    // Same scenario, but RGL pushed B down to (1, 1). The swap still
    // forces B back to A's original slot rather than wherever RGL put it.
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 1, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 1, w: 1, h: 1 }, // pushed by RGL
    ];
    const oldItem: LayoutItem = { i: 'A', x: 0, y: 0, w: 1, h: 1 };
    const newItem: LayoutItem = { i: 'A', x: 1, y: 0, w: 1, h: 1 };
    const swapped = computeSwap(preDrag, postDrag, oldItem, newItem);
    expect(swapped).not.toBeNull();
    const byId = Object.fromEntries(swapped!.map((it) => [it.i, it]));
    expect(byId.B).toEqual(expect.objectContaining({ x: 0, y: 0 }));
  });

  it('returns null when the dragger did not actually move', () => {
    const preDrag: LayoutItem[] = [{ i: 'A', x: 0, y: 0, w: 1, h: 1 }];
    const item: LayoutItem = { i: 'A', x: 0, y: 0, w: 1, h: 1 };
    expect(computeSwap(preDrag, preDrag, item, item)).toBeNull();
  });

  it('returns null when the target cell was empty', () => {
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 1, y: 0, w: 1, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
    ];
    const result = computeSwap(preDrag, postDrag, preDrag[0], { i: 'A', x: 1, y: 0, w: 1, h: 1 });
    expect(result).toBeNull();
  });

  it('returns null when the target cell had more than one occupant', () => {
    // Wide dragger lands across two narrow neighbours — not a clean 1:1
    // swap. Skip and let RGL's natural handling take over.
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 2, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
      { i: 'C', x: 3, y: 0, w: 1, h: 1 },
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 2, y: 0, w: 2, h: 1 }, // spans cols 2-3, overlaps both B and C
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
      { i: 'C', x: 3, y: 0, w: 1, h: 1 },
    ];
    const result = computeSwap(preDrag, postDrag, preDrag[0], { i: 'A', x: 2, y: 0, w: 2, h: 1 });
    expect(result).toBeNull();
  });

  it('returns null when the dragger and occupant have different sizes', () => {
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 2, h: 1 }, // wide
      { i: 'B', x: 2, y: 0, w: 1, h: 1 }, // narrow
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 2, y: 0, w: 2, h: 1 },
      { i: 'B', x: 2, y: 0, w: 1, h: 1 },
    ];
    const result = computeSwap(preDrag, postDrag, preDrag[0], { i: 'A', x: 2, y: 0, w: 2, h: 1 });
    expect(result).toBeNull();
  });

  it("preserves the dragger's post-drag position", () => {
    const preDrag: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
    ];
    const postDrag: LayoutItem[] = [
      { i: 'A', x: 1, y: 0, w: 1, h: 1 },
      { i: 'B', x: 1, y: 0, w: 1, h: 1 },
    ];
    const oldItem: LayoutItem = { i: 'A', x: 0, y: 0, w: 1, h: 1 };
    const newItem: LayoutItem = { i: 'A', x: 1, y: 0, w: 1, h: 1 };
    const swapped = computeSwap(preDrag, postDrag, oldItem, newItem);
    expect(swapped).not.toBeNull();
    const a = swapped!.find((it) => it.i === 'A')!;
    expect(a.x).toBe(newItem.x);
    expect(a.y).toBe(newItem.y);
  });
});

describe('compactRowAligned', () => {
  it('returns [] for an empty layout', () => {
    expect(compactRowAligned([])).toEqual([]);
  });

  it('leaves an already-aligned layout unchanged', () => {
    const layout: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
      { i: 'C', x: 0, y: 3, w: 1, h: 2 },
      { i: 'D', x: 1, y: 3, w: 1, h: 2 },
    ];
    const out = compactRowAligned(layout);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.y).toBe(0);
    expect(byId.B.y).toBe(0);
    expect(byId.C.y).toBe(3);
    expect(byId.D.y).toBe(3);
  });

  it('aligns cross-column row baselines after RGL pushes only one column', () => {
    // The cross-column misalignment scenario the user wants fixed:
    // - Row 0: A (h=4 after resize), B (h=3) — A grew, B unchanged
    // - Row 1: C (was at y=2, col 0), D (was at y=3, col 1)
    // RGL's verticalCompactor pushes C from y=2 down to y=4 (clear of A
    // at y=0..4) but leaves D at y=3 (B's bottom). So C and D end up at
    // different ys even though they're conceptually the same row.
    const pushedByRgl: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 4 },
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
      { i: 'C', x: 0, y: 4, w: 1, h: 2 },
      { i: 'D', x: 1, y: 3, w: 1, h: 2 },
    ];
    const out = compactRowAligned(pushedByRgl);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.y).toBe(0);
    expect(byId.B.y).toBe(0);
    // C and D snap to the same row top.
    expect(byId.C.y).toBe(byId.D.y);
    // That shared row starts at row 0's max-bottom (=4).
    expect(byId.C.y).toBe(4);
  });

  it("aligns the user's example: col 0 at 0/2/4, col 1 at 0/3/5 → both cols at 0/3/5", () => {
    const masonry: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
      { i: 'C', x: 0, y: 2, w: 1, h: 2 },
      { i: 'D', x: 1, y: 3, w: 1, h: 2 },
      { i: 'E', x: 0, y: 4, w: 1, h: 2 },
      { i: 'F', x: 1, y: 5, w: 1, h: 2 },
    ];
    const out = compactRowAligned(masonry);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.y).toBe(0);
    expect(byId.B.y).toBe(0);
    expect(byId.C.y).toBe(3);
    expect(byId.D.y).toBe(3);
    expect(byId.E.y).toBe(5);
    expect(byId.F.y).toBe(5);
  });

  it('closes vertical gaps between rows', () => {
    const layout: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 0, y: 10, w: 1, h: 2 },
    ];
    const out = compactRowAligned(layout);
    expect(out.find((it) => it.i === 'A')?.y).toBe(0);
    expect(out.find((it) => it.i === 'B')?.y).toBe(2);
  });

  it('a card dropped into an already-occupied column starts a new row', () => {
    // Row 0 has A (col 0, h=2) and B (col 1, h=3). User drops D at
    // (col 0, y=2) — col 0 is already taken by A. D can't fit at row 0,
    // so it pushes to a new row below row 0's max-bottom (=3).
    const layout: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
      { i: 'D', x: 0, y: 2, w: 1, h: 1 },
    ];
    const out = compactRowAligned(layout);
    const byId = Object.fromEntries(out.map((it) => [it.i, it]));
    expect(byId.A.y).toBe(0);
    expect(byId.B.y).toBe(0);
    expect(byId.D.y).toBe(3);
  });

  it('preserves the original item order of the input layout', () => {
    const layout: LayoutItem[] = [
      { i: 'B', x: 1, y: 0, w: 1, h: 3 },
      { i: 'A', x: 0, y: 0, w: 1, h: 2 },
      { i: 'C', x: 0, y: 5, w: 1, h: 1 },
    ];
    const out = compactRowAligned(layout);
    expect(out.map((it) => it.i)).toEqual(['B', 'A', 'C']);
  });

  it('preserves x, w, h — only y is reassigned', () => {
    const layout: LayoutItem[] = [
      { i: 'A', x: 0, y: 0, w: 2, h: 2 },
      { i: 'B', x: 2, y: 7, w: 1, h: 3 },
    ];
    const out = compactRowAligned(layout);
    const a = out.find((it) => it.i === 'A')!;
    const b = out.find((it) => it.i === 'B')!;
    expect(a.x).toBe(0);
    expect(a.w).toBe(2);
    expect(a.h).toBe(2);
    expect(b.x).toBe(2);
    expect(b.w).toBe(1);
    expect(b.h).toBe(3);
  });
});
