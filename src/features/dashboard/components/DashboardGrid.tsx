import { useCallback, useRef } from 'react';
import { GridLayout, useContainerWidth, type EventCallback, type Layout } from 'react-grid-layout';
import type { DataSelections } from 'udi-toolkit/react';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import { DRAG_HANDLE_CLASS, GRID_MARGIN } from '../utils/gridDefaults';
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
  }, []);

  const handleDragStop: EventCallback = useCallback(
    (newLayout, oldItem, newItem) => {
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

  return (
    <div ref={containerRef} className="w-full min-h-0">
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
            handles: ['se', 'e', 's'],
          }}
          compactor={rowAlignedCompactor}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
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
                <div key={it.i}>
                  <DashboardCard vizKey={it.i} viz={viz} selections={selections} />
                </div>
              );
            })}
        </GridLayout>
      ) : null}
    </div>
  );
}
