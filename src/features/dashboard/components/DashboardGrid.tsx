import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { GridLayout, useContainerWidth, type EventCallback, type Layout } from 'react-grid-layout';
import type { DataSelections } from 'udi-toolkit/react';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import { DRAG_HANDLE_CLASS, GRID_INTERACTING_CLASS, GRID_MARGIN } from '../utils/gridDefaults';
import { computeSwap, rowAlignedCompactor } from '../utils/gridPacking';
import { DashboardCard } from './DashboardCard';

interface DashboardGridProps {
  selections: DataSelections;
}

export function DashboardGrid({ selections }: DashboardGridProps) {
  const items = useDashboard((s) => s.layout.items);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const gridCols = useDashboard((s) => s.gridCols);
  const gridRowHeight = useDashboard((s) => s.gridRowHeight);
  const dashboardStore = useDashboardStore();
  const { width, containerRef, mounted } = useContainerWidth();

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      dashboardStore.getState().setLayoutItems(next);
    },
    [dashboardStore],
  );

  // Drag-to-swap: when a card is dropped onto another card RGL's default
  // behavior is to PUSH the occupant out of the way (per the compactor's
  // type='vertical'). The occupant lands wherever RGL's chain of pushes
  // ends up — usually NOT at the dragger's old position. The UX users
  // expect for "drop card A onto card B" is a swap: A takes B's slot, B
  // takes A's slot. We implement that here.
  const preDragLayoutRef = useRef<Layout | null>(null);

  const handleDragStart: EventCallback = useCallback((layout) => {
    preDragLayoutRef.current = layout.map((it) => ({ ...it }));
    document.body.classList.add(GRID_INTERACTING_CLASS);
  }, []);

  const handleDragStop: EventCallback = useCallback(
    (newLayout, oldItem, newItem) => {
      document.body.classList.remove(GRID_INTERACTING_CLASS);
      const preDrag = preDragLayoutRef.current;
      preDragLayoutRef.current = null;
      if (!preDrag || !oldItem || !newItem) return;
      const swapped = computeSwap(preDrag, newLayout, oldItem, newItem);
      if (swapped) {
        dashboardStore.getState().setLayoutItems(swapped);
      }
    },
    [dashboardStore],
  );

  // Suppress text selection across the whole page while a card is being
  // dragged or resized. RGL's underlying react-resizable / react-draggable
  // preventDefault the initial mousedown, but selection can still extend
  // once the cursor crosses into other elements — easy to reproduce by
  // resizing past an adjacent card or chat message. A body-level class
  // turning off user-select keeps the interaction clean and gets cleared
  // unconditionally on stop.
  const handleResizeStart: EventCallback = useCallback(() => {
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
