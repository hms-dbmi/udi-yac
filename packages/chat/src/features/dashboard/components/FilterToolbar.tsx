import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDashboard, useDashboardStore, useDataFilters, useGlobal } from '@/app/UDIChatContext';
import { useFilterChips, type ChipInfo } from '../hooks/useFilterChips';

/**
 * The dashboard's Filters section: a chip per active filter. With none, a
 * read-only view renders nothing — its reader can brush but not ask, so the
 * empty state's "ask in the chat" is noise. Once chatting it is shown, as is
 * debug mode's, whose heading carries the Filter Nulls switch.
 */
export function FilterToolbar() {
  const dashboardStore = useDashboardStore();
  const filterAllNullValues = useDashboard((s) => s.filterAllNullValues);
  const debugMode = useGlobal((s) => s.debugMode);
  const readOnly = useGlobal((s) => s.readOnly);
  const clearFilter = useDataFilters((s) => s.clearFilter);
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
        <FilterChips chips={chips} onClear={clearFilter} />
      )}
    </div>
  );
}

export function FilterChips({
  chips,
  onClear,
}: {
  chips: ChipInfo[];
  onClear: (id: string) => void;
}) {
  return (
    <div className="udi:flex udi:items-center udi:gap-1.5 udi:flex-wrap">
      {chips.map((chip) => (
        <div key={`${chip.id}-${chip.label}`} className="udi:group udi:relative udi:inline-block">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  // Named for its chip — "Clear filter" alone doesn't say which of
                  // several — and shown on keyboard focus, not only on hover.
                  aria-label={`Clear filter ${chip.label}: ${chip.value}`}
                  className="udi:absolute udi:-top-1.5 udi:-right-1.5 udi:z-10 udi:h-4 udi:w-4 udi:rounded-full udi:border udi:bg-background udi:shadow-sm udi:opacity-0 udi:group-hover:opacity-100 udi:focus-visible:opacity-100 udi:transition-opacity"
                  onClick={() => onClear(chip.id)}
                />
              }
            >
              <X className="udi:h-2.5 udi:w-2.5" />
            </TooltipTrigger>
            <TooltipContent>Clear filter</TooltipContent>
          </Tooltip>
          <Badge
            variant="outline"
            className="udi:rounded-sm udi:text-xs udi:font-normal udi:gap-1.5 udi:cursor-default"
            title={`${chip.dataSourceKey} - ${chip.type}`}
          >
            <span className="udi:font-medium">{chip.label}</span>
            <span className="udi:font-mono">{chip.value}</span>
          </Badge>
        </div>
      ))}
    </div>
  );
}
