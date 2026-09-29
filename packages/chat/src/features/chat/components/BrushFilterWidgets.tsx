import { FilterCollapsible, FilterControls, useBrushFilters } from '@/features/dashboard';

/**
 * Renders an adjustment widget in the chat for each active visualization brush
 * filter. Each one is presented like an LLM-originated `FilterData` filter, so
 * a brush filter reads as a chat message — collapsing it removes the filter,
 * expanding restores it cleared. Brush selections live in the shared Pinia
 * store (mirrored into `dataFiltersStore.internalDataSelections`), not the
 * conversation, so these never leak into the LLM message history.
 */
export function BrushFilterWidgets() {
  const brushFilters = useBrushFilters();

  if (brushFilters.length === 0) return null;

  return (
    <>
      {brushFilters.map((brush) => (
        <div key={brush.id} data-message className="udi:flex udi:scroll-mt-6 udi:justify-start">
          <div className="udi:max-w-[85%] udi:min-w-0 udi:rounded-lg udi:bg-muted udi:px-3 udi:py-2 udi:wrap-break-word">
            <FilterCollapsible filterId={brush.id} selection={brush.selection}>
              <FilterControls filterId={brush.id} selection={brush.selection} tweakable={false} />
            </FilterCollapsible>
          </div>
        </div>
      ))}
    </>
  );
}
