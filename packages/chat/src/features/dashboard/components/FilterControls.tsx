import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDataFilters, useDataFiltersStore, useDataPackage } from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import type { DataSelection } from '../stores/dataFiltersStore';
import { IntervalFilterComponent } from './IntervalFilterComponent';
import { PointFilterComponent } from './PointFilterComponent';

/**
 * The adjustment widget for one filter, by type. Edits go to
 * `dataFiltersStore.setFilter(filterId, …)`, which routes chat, host and brush
 * filters alike — so the chat, the brush widgets and the filter bar's popover
 * all render the same thing.
 */
export function FilterControls({
  filterId,
  selection,
  tweakable,
  hideClearAll,
}: {
  filterId: string;
  selection: DataSelection;
  tweakable: boolean;
  hideClearAll?: boolean;
}) {
  const fields = Object.keys(selection.selection ?? {});

  if (selection.type === 'interval') {
    return (
      <div className="udi:space-y-3 udi:p-2">
        {fields.map((_, idx) => (
          <IntervalFilterComponent
            key={idx}
            dataSelection={selection}
            fieldIndex={idx}
            tweakable={tweakable}
            filterKey={filterId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="udi:p-2">
      <PointFilterComponent
        dataSelection={selection}
        tweakable={tweakable}
        filterKey={filterId}
        hideClearAll={hideClearAll}
      />
    </div>
  );
}

/**
 * A filter's chat item. Expanded means the filter is in place; collapsing it
 * removes the filter (chip gone, data unfiltered) and expanding brings it back
 * cleared — the same state the filter bar's "Remove filter" leaves, so either
 * side can undo the other.
 */
export function FilterCollapsible({
  filterId,
  selection,
  children,
}: {
  filterId: string;
  selection: DataSelection;
  children: ReactNode;
}) {
  const removed = useDataFilters((s) => !!s.removedFilters[filterId]);
  // Lit while this filter's chip is hovered in the filter bar; hovering here
  // lights the chip (and a brush's chart) in turn.
  const highlighted = useDataFilters(
    (s) => s.hoveredFilter?.from === 'toolbar' && s.hoveredFilter.id === filterId,
  );
  const dataFiltersStore = useDataFiltersStore();
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);
  const label = Object.keys(selection.selection ?? {})
    .map((f) => getFieldLabel(selection.dataSourceKey, f))
    .join(', ');

  const toggle = () => {
    const store = dataFiltersStore.getState();
    if (removed) store.restoreFilter(filterId);
    else store.removeFilter(filterId);
  };

  const store = dataFiltersStore.getState();
  return (
    <div
      className={cn(
        'udi:rounded-md udi:transition-shadow',
        highlighted && 'udi:ring-2 udi:ring-primary/50',
      )}
      onMouseEnter={() => store.setHoveredFilter({ id: filterId, from: 'chat' })}
      onMouseLeave={() => {
        if (dataFiltersStore.getState().hoveredFilter?.id === filterId)
          store.setHoveredFilter(null);
      }}
    >
      <button
        type="button"
        aria-expanded={!removed}
        title={removed ? 'Restore this filter' : 'Remove this filter'}
        onClick={toggle}
        className="udi:flex udi:items-center udi:gap-1 udi:px-2 udi:pt-1 udi:text-xs udi:text-muted-foreground udi:hover:text-foreground"
      >
        <ChevronRight
          aria-hidden
          className={cn('udi:h-3 udi:w-3 udi:transition-transform', !removed && 'udi:rotate-90')}
        />
        Filter: {label}
        {removed && <span className="udi:italic">(removed)</span>}
      </button>
      {!removed && children}
    </div>
  );
}
