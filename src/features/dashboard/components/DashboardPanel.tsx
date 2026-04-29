import { useMemo } from 'react';
import {
  useDashboard,
  useSelections,
  useDashboardStore,
  useDataFilters,
} from '@/app/UDIChatContext';
import { DashboardCard } from './DashboardCard';
import { WelcomeSplash } from './WelcomeSplash';
import { FilterToolbar } from './FilterToolbar';
import { DataCounts } from './DataCounts';
import { DownloadButton } from './DownloadButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function DashboardHeader() {
  return (
    <div className="flex items-center justify-between gap-2 shrink-0">
      <DataCounts />
      <DownloadButton />
    </div>
  );
}

export function DashboardPanel() {
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  const vizSelections = useSelections((s) => s.selections);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const filterAllNullValues = useDashboard((s) => s.filterAllNullValues);
  const dashboardStore = useDashboardStore();

  // Merge viz brush selections with FilterData selections so UDIVis can
  // resolve both kinds of named filter references in transformations.
  const mergedSelections = useMemo(
    () => ({ ...vizSelections, ...dataSelections }),
    [vizSelections, dataSelections],
  );

  const entries = Array.from(pinnedVisualizations.entries()).reverse();

  const hasEntries = entries.length > 0;

  // No entries → skip the ScrollArea. A consumer-provided tall mascot (or
  // long custom splash messages) would otherwise make the inner content
  // exceed the viewport and turn the whole panel scrollable; clip to the
  // container instead and give WelcomeSplash a real parent height so its
  // `h-full` anchors correctly.
  if (!hasEntries) {
    return (
      <div className="h-full p-3 overflow-hidden">
        <div className="flex flex-col gap-3">
          <DashboardHeader />
          <div className="min-h-0 flex-1">
            <WelcomeSplash />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full p-3">
      <div className="flex flex-col gap-3">
        <DashboardHeader />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Filters
            </h3>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="null-filter" className="text-[10px] text-muted-foreground">
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
          </div>
          <FilterToolbar />
        </div>
        <Separator />
        {entries.map(([key, viz]) => (
          <DashboardCard key={key} vizKey={key} viz={viz} selections={mergedSelections} />
        ))}
      </div>
    </ScrollArea>
  );
}
