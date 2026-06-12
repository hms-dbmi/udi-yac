import { useDashboard, useDashboardStore, useDataFilters, useGlobal } from '@/app/UDIChatContext';
import { DashboardGrid } from './DashboardGrid';
import { GridSettingsButton } from './GridSettingsButton';
import { WelcomeSplash } from './WelcomeSplash';
import { FilterToolbar } from './FilterToolbar';
import { DataCounts } from './DataCounts';
import { DownloadButton } from './DownloadButton';
import { SessionImportExportButton } from './SessionImportExportButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function DashboardHeader() {
  return (
    <div className="flex items-center justify-between gap-2 shrink-0">
      <DataCounts />
      <div className="flex items-center gap-1.5">
        <GridSettingsButton />
        <SessionImportExportButton />
        <DownloadButton />
      </div>
    </div>
  );
}

export function DashboardPanel() {
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const filterAllNullValues = useDashboard((s) => s.filterAllNullValues);
  const debugMode = useGlobal((s) => s.debugMode);
  const dashboardStore = useDashboardStore();

  // Brush selections live in the shared Pinia DataSourcesStore — UDIVis's
  // signal handlers write them there directly. We only pass LLM-set filters
  // via the `selections` prop; UDIVis merges with Pinia state internally.
  const mergedSelections = dataSelections;

  const hasEntries = activeVisualizations.size > 0;

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
    <div className="h-full">
      <ScrollArea className="h-full p-3">
        <div className="flex flex-col gap-3">
          <DashboardHeader />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Filters
              </h3>
              {debugMode && (
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
              )}
            </div>
            <FilterToolbar />
          </div>
          <Separator />
          <DashboardGrid selections={mergedSelections} />
        </div>
      </ScrollArea>
    </div>
  );
}
