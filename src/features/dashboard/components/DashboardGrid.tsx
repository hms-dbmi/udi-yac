import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { GridLayout, useContainerWidth, type EventCallback, type Layout } from 'react-grid-layout';
import type { DataSelections } from 'udi-toolkit/react';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import { DRAG_HANDLE_CLASS, GRID_INTERACTING_CLASS, GRID_MARGIN } from '../utils/gridDefaults';
import { compactRowAligned, computeReorder, rowAlignedCompactor } from '../utils/gridPacking';
import { DashboardCard } from './DashboardCard';

interface DashboardGridProps {
  selections: DataSelections;
}

/** Order-independent position compare (RGL may echo items in a different array
 * order than we stored them). Only (i, x, y, w, h) matter. */
function layoutsMatchByItem(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((it) => [it.i, it]));
  for (const it of b) {
    const o = byId.get(it.i);
    if (!o || o.x !== it.x || o.y !== it.y || o.w !== it.w || o.h !== it.h) return false;
  }
  return true;
}

export function DashboardGrid({ selections }: DashboardGridProps) {
  const items = useDashboard((s) => s.layout.items);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const gridCols = useDashboard((s) => s.gridCols);
  const gridRowHeight = useDashboard((s) => s.gridRowHeight);
  const dashboardStore = useDashboardStore();
  const { width, containerRef, mounted } = useContainerWidth();

  // After a drag we replace RGL's layout with computeReorder's push-back-in-row
  // result. But RGL vertical-compacts the drop (shoving the displaced card down
  // a row) and echoes THAT layout back through onLayoutChange right after
  // onDragStop — more than once. Those echoes would clobber our result. So when
  // we apply a reorder we stash the exact layout RGL will settle to here, and
  // handleLayoutChange ignores RGL's transient echoes until it re-syncs to it.
  const authoritativeLayoutRef = useRef<Layout | null>(null);

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      const authoritative = authoritativeLayoutRef.current;
      if (authoritative) {
        if (layoutsMatchByItem(next, authoritative)) authoritativeLayoutRef.current = null;
        return; // ignore RGL's post-drop push-down echoes until it catches up
      }
      dashboardStore.getState().setLayoutItems(next);
    },
    [dashboardStore],
  );

  // Drag-to-reorder: when a card is dropped onto a row, RGL's default is to
  // PUSH the occupant out of the way and let the compactor bump it to a new
  // row. Users instead expect the dropped card to slot in and shove the row's
  // other cards sideways, only spilling to a new row when the row is too full.
  // computeReorder builds that layout from the pre-drag snapshot; the drop x
  // decides the insertion point.
  const preDragLayoutRef = useRef<Layout | null>(null);

  const handleDragStart: EventCallback = useCallback((layout) => {
    authoritativeLayoutRef.current = null;
    preDragLayoutRef.current = layout.map((it) => ({ ...it }));
    document.body.classList.add(GRID_INTERACTING_CLASS);
  }, []);

  const handleDragStop: EventCallback = useCallback(
    (_newLayout, oldItem, newItem) => {
      document.body.classList.remove(GRID_INTERACTING_CLASS);
      const preDrag = preDragLayoutRef.current;
      preDragLayoutRef.current = null;
      if (!preDrag || !oldItem || !newItem) return;
      const reordered = computeReorder(preDrag, oldItem, newItem, gridCols);
      if (reordered) {
        // Pre-apply the compactor so we hold exactly what RGL settles to, then
        // guard against its push-down echoes overwriting it (see the ref above).
        const settled = compactRowAligned(reordered);
        authoritativeLayoutRef.current = settled;
        dashboardStore.getState().setLayoutItems(settled);
      }
    },
    [dashboardStore, gridCols],
  );

  // Suppress text selection across the whole page while a card is being
  // dragged or resized. RGL's underlying react-resizable / react-draggable
  // preventDefault the initial mousedown, but selection can still extend
  // once the cursor crosses into other elements — easy to reproduce by
  // resizing past an adjacent card or chat message. A body-level class
  // turning off user-select keeps the interaction clean and gets cleared
  // unconditionally on stop.
  const handleResizeStart: EventCallback = useCallback(() => {
    authoritativeLayoutRef.current = null;
    document.body.classList.add(GRID_INTERACTING_CLASS);
  }, []);
  const handleResizeStop: EventCallback = useCallback(() => {
    document.body.classList.remove(GRID_INTERACTING_CLASS);
  }, []);

  useEffect(() => {
    return () => {
      document.body.classList.remove(GRID_INTERACTING_CLASS);
    };
  }, []);

  // Swim-lane backdrop: paint faint grid lines on the wrapper so the
  // column / row structure is visible even before the user starts a drag.
  //
  // Columns are uniform width, so vertical lines tile at a fixed step:
  // colStep = colWidth + marginX = (width + marginX) / cols. They live on
  // the wrapper's CSS background (see .dashboard-grid-lanes in index.css).
  //
  // Rows are NOT uniform — the row-aligned compactor sets each row's
  // extent to `max(h of items in that row)`, so the divider positions
  // depend on the current layout. We read every unique `y` from the
  // layout (each one is a row top), tack on the layout's bottom-most
  // edge, convert from grid units to pixels with RGL's positioning math,
  // and render one absolutely-positioned divider per boundary.
  const colStep = useMemo(() => {
    if (!width || gridCols < 1) return 0;
    return (width + GRID_MARGIN[0]) / gridCols;
  }, [width, gridCols]);

  const rowDividerTopsPx = useMemo<number[]>(() => {
    if (items.length === 0) return [];
    const extentByTop = new Map<number, number>();
    for (const it of items) {
      const prev = extentByTop.get(it.y) ?? 0;
      if (it.h > prev) extentByTop.set(it.y, it.h);
    }
    const tops = Array.from(extentByTop.keys()).sort((a, b) => a - b);
    const lastTop = tops[tops.length - 1];
    const layoutBottom = lastTop + (extentByTop.get(lastTop) ?? 0);
    const boundariesInGridUnits = [...tops, layoutBottom];
    // RGL: pixel_top = grid_y * (rowHeight + marginY) + containerPadding[1].
    // Our containerPadding[1] is 8 (see gridConfig below).
    const step = gridRowHeight + GRID_MARGIN[1];
    return boundariesInGridUnits.map((gy) => gy * step + 8);
  }, [items, gridRowHeight]);

  const laneStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--swim-col-step': `${colStep}px`,
      }) as CSSProperties,
    [colStep],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-0 dashboard-grid-lanes"
      style={laneStyle}
    >
      {mounted &&
        rowDividerTopsPx.map((topPx, i) => (
          <div
            key={`${i}-${topPx}`}
            className="dashboard-grid-row-divider"
            style={{ top: `${topPx}px` }}
            aria-hidden
          />
        ))}
      {mounted && items.length > 0 ? (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={{
            cols: gridCols,
            rowHeight: gridRowHeight,
            margin: GRID_MARGIN,
            // Small padding above + on the sides so cards have visual breathing
            // room and drag-above-row-0 has somewhere to land visually.
            containerPadding: [0, 8],
            maxRows: Infinity,
          }}
          dragConfig={{
            enabled: true,
            bounded: false,
            handle: `.${DRAG_HANDLE_CLASS}`,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: true,
            // North handles (n / nw / ne) are intentionally omitted — they
            // require RGL to change both `y` AND `h` mid-resize, which the
            // row-aligned compactor immediately snaps back, so the gesture
            // visually does nothing.
            handles: ['sw', 'se', 'e', 's', 'w'],
          }}
          compactor={rowAlignedCompactor}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
          onResizeStart={handleResizeStart}
          onResizeStop={handleResizeStop}
          autoSize
        >
          {/*
            Render children in a STABLE order (sorted by `i`) regardless of
            the layout's current row-major ordering. RGL positions each
            child via absolute CSS transforms keyed off the layout array,
            so DOM order is purely cosmetic to React's reconciler.

            If we instead iterated `items` directly, dragging a card to a
            new row would shuffle the array's element order — and React
            would `insertBefore` the underlying DOM nodes to match. That
            detach/reattach kills the `<udi-vis>` custom element's
            connection to its Vega view's container, leaving the chart
            blank until a key-change remount (e.g. table-view toggle)
            rebuilds it.
          */}
          {[...items]
            .sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0))
            .map((it) => {
              const viz = activeVisualizations.get(it.i);
              if (!viz) return null;
              return (
                <div key={it.i} className="dashboard-grid-slot">
                  <DashboardCard vizKey={it.i} viz={viz} selections={selections} />
                </div>
              );
            })}
        </GridLayout>
      ) : null}
    </div>
  );
}
