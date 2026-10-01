import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
          // Read-only too: brushing the chart again brings a brush filter
          // back, and the chat's widget restores any filter once chatting.
          onRemove={(id) => dataFiltersStore.getState().removeFilter(id)}
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
  onRemove,
  onReset,
}: {
  chips: ChipInfo[];
  onRemove: (id: string) => void;
  onReset: () => void;
}) {
  // The chip whose removal waits on the confirmation. Held here, not in its
  // popover, which closes as the dialog opens and would unmount a dialog
  // living inside it.
  // Kept after the dialog closes, so its text holds through the exit animation.
  const [removing, setRemoving] = useState<ChipInfo | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
          <PopoverContent align="start" className="udi:w-96 udi:p-2 udi:[--udi-filter-rows:12]">
            {/* Clearing is in the controls: a category list's select-all row,
                a range's reset. */}
            <FilterControls filterId={chip.id} selection={chip.selection} tweakable={false} />
            <div className="udi:flex udi:items-center udi:gap-2 udi:px-2 udi:pb-1">
              {/* Closes the popover, which would otherwise sit above the
                  dialog's backdrop. */}
              <PopoverClose
                render={<Button size="sm" variant="ghost" />}
                onClick={() => {
                  setRemoving(chip);
                  setConfirmOpen(true);
                }}
              >
                Remove filter
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      ))}
      <Button variant="link" size="sm" className="udi:h-7 udi:text-xs" onClick={onReset}>
        Reset
      </Button>
      {/* Removing is hard to undo from here: the chip goes, and the filter
          comes back only from its chat widget (or, for a chart's, by selecting
          on the chart again). So it asks first, as Reset conversation does. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="udi:max-w-sm">
          <DialogHeader>
            <DialogTitle className="udi:text-sm">Remove the {removing?.label} filter?</DialogTitle>
            <DialogDescription>
              It stops filtering the dashboard and its chip leaves the filter bar. To bring it back,
              expand it in the chat
              {removing?.origin === 'chart' ? ', or select on its chart again' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (removing) onRemove(removing.id);
                setConfirmOpen(false);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
