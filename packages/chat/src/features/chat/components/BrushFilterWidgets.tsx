import { useCallback } from 'react';
import { IntervalFilterComponent, PointFilterComponent } from '@/features/tool-calls';
import { useBrushFilters, type BrushFilter, type DataSelection } from '@/features/dashboard';
import { useDataFiltersStore } from '@/app/UDIChatContext';

function BrushFilterWidget({ brush }: { brush: BrushFilter }) {
  const dataFiltersStore = useDataFiltersStore();

  const handleCommit = useCallback(
    (next: DataSelection) => {
      // Keep the (possibly empty) selection rather than deleting it, so a point
      // brush with every value unchecked persists its widget for re-selection.
      // The brush is fully removed only via the toolbar chip's clear action.
      dataFiltersStore.getState().updateInternalDataSelections({ [brush.uuid]: next });
    },
    [dataFiltersStore, brush.uuid],
  );

  const { selection } = brush;
  const fields = Object.keys(selection.selection ?? {});

  if (selection.type === 'interval') {
    return (
      <div className="space-y-3 p-2">
        {fields.map((_, idx) => (
          <IntervalFilterComponent
            key={idx}
            dataSelection={selection}
            fieldIndex={idx}
            tweakable={false}
            filterKey={brush.uuid}
            onCommit={handleCommit}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-2">
      <PointFilterComponent
        dataSelection={selection}
        tweakable={false}
        filterKey={brush.uuid}
        onCommit={handleCommit}
      />
    </div>
  );
}

/**
 * Renders an adjustment widget in the chat for each active visualization brush
 * filter. Each one is presented like an LLM-originated `FilterData` filter, so
 * a brush filter reads as a chat message. Brush selections live in the shared
 * Pinia store (mirrored into `dataFiltersStore.internalDataSelections`), not
 * the conversation, so these never leak into the LLM message history.
 */
export function BrushFilterWidgets() {
  const brushFilters = useBrushFilters();

  if (brushFilters.length === 0) return null;

  return (
    <>
      {brushFilters.map((brush) => (
        <div key={brush.uuid} data-message className="flex scroll-mt-6 justify-start">
          <div className="max-w-[85%] min-w-0 rounded-lg bg-muted px-3 py-2 wrap-break-word">
            <BrushFilterWidget brush={brush} />
          </div>
        </div>
      ))}
    </>
  );
}
