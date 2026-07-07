import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  GridLayout,
  useContainerWidth,
  type Compactor,
  type EventCallback,
  type Layout,
} from 'react-grid-layout';
import type { DataSelections } from 'udi-toolkit/react';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import {
  DRAG_HANDLE_CLASS,
  GRID_INTERACTING_CLASS,
  GRID_MARGIN,
  gridColsForWidth,
} from '../utils/gridDefaults';
import { packRowMajor } from '../utils/gridPacking';
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

  // On initial load, size the column count to the container via the shared
  // width → cols rule (gridColsForWidth). Runs once on mount; resizing
  // afterward is intentionally left alone. We read offsetWidth directly since
  // `width` starts at a placeholder before the first measure.
  useEffect(() => {
    const w = containerRef.current?.offsetWidth ?? 0;
    if (w > 0) {
      dashboardStore.getState().setGridCols(gridColsForWidth(w));
    }
  }, [containerRef, dashboardStore]);

  // Keep the measured width in the store so the "Reset layout" action (in the
  // gear popover, which can't measure the grid itself) can re-derive the column
  // count for the current width. This does not change the column count on
  // resize — only the on-mount effect above does that.
  useEffect(() => {
    if (width > 0) dashboardStore.getState().setContainerWidth(width);
  }, [width, dashboardStore]);

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      dashboardStore.getState().setLayoutItems(next);
    },
    [dashboardStore],
  );

  // Height is a ROW property: the compactor gives every card in a row the row's
  // max height. To resize a row we let RGL's per-card `s` handle drive it, but
  // feed the dragged card's intended height back into the compactor as an
  // override so the WHOLE row previews at that height live — grow and shrink
  // (shrinking below other cards, which `max` alone can't). RGL calls `onResize`
  // (with the intended h) before it runs the compactor, so the ref is set in
  // time; on stop it compacts once more (ref still set) then we clear it, and
  // the committed row is uniform so `max`-normalization reproduces it.
  const resizeOverrideRef = useRef<{ id: string; h: number } | null>(null);
  const compactor = useMemo<Compactor>(
    () => ({
      type: 'horizontal',
      allowOverlap: false,
      compact: (layout, cols) => packRowMajor(layout, cols, resizeOverrideRef.current ?? undefined),
    }),
    [],
  );

  // Drag and resize go entirely through RGL + the compactor above, which
  // re-packs the ordered list on every change — so the drop matches the live
  // preview and the store never holds a gapped layout. The start/stop handlers
  // toggle a body-level class that suppresses page-wide text selection during
  // the interaction: RGL's react-draggable / react-resizable preventDefault the
  // initial mousedown, but selection can still extend once the cursor crosses
  // into other elements (e.g. resizing past an adjacent card or chat message).
  const handleInteractStart: EventCallback = useCallback(() => {
    document.body.classList.add(GRID_INTERACTING_CLASS);
  }, []);
  const handleInteractStop: EventCallback = useCallback(() => {
    document.body.classList.remove(GRID_INTERACTING_CLASS);
  }, []);

  const handleResizeStart: EventCallback = useCallback(() => {
    resizeOverrideRef.current = null;
    document.body.classList.add(GRID_INTERACTING_CLASS);
  }, []);
  const handleResize: EventCallback = useCallback((_layout, _oldItem, newItem) => {
    if (newItem) resizeOverrideRef.current = { id: newItem.i, h: newItem.h };
  }, []);
  const handleResizeStop: EventCallback = useCallback(() => {
    resizeOverrideRef.current = null;
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
  // Rows are NOT uniform — packing sets each row's extent to
  // `max(h of items in that row)`, so the divider positions
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
            // `e` = width (per-card: the card spans more columns, pushing/
            // wrapping neighbours). `s` = height, but height is a ROW property,
            // so dragging it resizes the whole row (see the compactor override
            // above). West/north/corner handles move the top-left origin, which
            // the pure-list packing doesn't allow, so they're omitted.
            handles: ['e', 's'],
          }}
          compactor={compactor}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleInteractStart}
          onDragStop={handleInteractStop}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
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
