import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  useDashboard,
  useDashboardStore,
  useDataFilters,
  useDataFiltersStore,
  useGlobal,
} from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import { useFilterChips, type ChipInfo } from '../hooks/useFilterChips';
import { FilterControls } from './FilterControls';

/**
 * The dashboard's Filters section: a chip per active filter. With none, a
 * read-only view renders nothing — its reader can brush but not ask, so the
 * empty state's "ask in the chat" is noise. Once chatting it is shown, as is
 * debug mode's, whose heading carries the Filter Nulls switch.
 */
export function FilterToolbar() {
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const filterAllNullValues = useDashboard((s) => s.filterAllNullValues);
  const debugMode = useGlobal((s) => s.debugMode);
  const readOnly = useGlobal((s) => s.readOnly);
  const chips = useFilterChips();

  if (chips.length === 0 && readOnly && !debugMode) return null;

  return (
    <div className="udi:px-3">
      <div className="udi:flex udi:items-center udi:justify-between udi:mb-1.5">
        <h3 className="udi:text-xs udi:font-medium udi:text-muted-foreground udi:uppercase udi:tracking-wider">
          Filters
        </h3>
        {debugMode && (
          <div className="udi:flex udi:items-center udi:gap-1.5">
            <Label htmlFor="null-filter" className="udi:text-[10px] udi:text-muted-foreground">
              Filter Nulls
            </Label>
            <Switch
              id="null-filter"
              checked={filterAllNullValues}
              onCheckedChange={(checked) =>
                dashboardStore.getState().setFilterAllNullValues(!!checked)
              }
            />
          </div>
        )}
      </div>
      {chips.length === 0 ? (
        <p className="udi:text-xs udi:text-muted-foreground udi:px-1">
          Ask in the chat or interact with visualizations to add data filters.
        </p>
      ) : (
        <FilterChips
          chips={chips}
          onClear={(id) => dataFiltersStore.getState().clearFilter(id)}
          // Read-only has no chat pane, so a removed filter could never be
          // re-expanded there — offer only Clear.
          onRemove={readOnly ? undefined : (id) => dataFiltersStore.getState().removeFilter(id)}
          onReset={() => dataFiltersStore.getState().clearAllFilters()}
        />
      )}
    </div>
  );
}

/**
 * A chip per filter field, each the trigger for a popover holding that
 * filter's controls. Entity and field are fixed there — changing what a filter
 * is about happens in the chat, where it came from.
 */
export function FilterChips({
  chips,
  onClear,
  onRemove,
  onReset,
}: {
  chips: ChipInfo[];
  onClear: (id: string) => void;
  onRemove?: (id: string) => void;
  onReset: () => void;
}) {
  // A chip lights while its filter's chat widget is hovered, and hovering a
  // chip lights the widget (and, for a brush, its chart).
  const hovered = useDataFilters((s) => s.hoveredFilter);
  const dataFiltersStore = useDataFiltersStore();
  const hover = (id: string | null) =>
    dataFiltersStore.getState().setHoveredFilter(id ? { id, from: 'toolbar' } : null);
  return (
    <div className="udi:flex udi:items-center udi:gap-1.5 udi:flex-wrap">
      {chips.map((chip) => (
        <Popover key={`${chip.id}-${chip.label}`}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'udi:h-7 udi:text-xs udi:font-normal',
                  hovered?.from === 'chat' &&
                    hovered.id === chip.id &&
                    'udi:ring-2 udi:ring-primary/50',
                )}
                title={`${chip.dataSourceKey} - ${chip.type}`}
                onMouseEnter={() => hover(chip.id)}
                onMouseLeave={() => {
                  if (dataFiltersStore.getState().hoveredFilter?.id === chip.id) hover(null);
                }}
              />
            }
          >
            <span className="udi:font-medium">{chip.label}</span>
            <span className="udi:font-mono udi:text-muted-foreground">{chip.value}</span>
            <ChevronDown aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="start" className="udi:w-80 udi:p-2">
            <FilterControls
              filterId={chip.id}
              selection={chip.selection}
              tweakable={false}
              hideClearAll
            />
            <div className="udi:flex udi:items-center udi:gap-2 udi:px-2 udi:pb-1">
              <Button size="sm" onClick={() => onClear(chip.id)}>
                Clear all
              </Button>
              {onRemove && (
                <Button size="sm" variant="ghost" onClick={() => onRemove(chip.id)}>
                  Remove filter
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      ))}
      <Button variant="link" size="sm" className="udi:h-7 udi:text-xs" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
