import { useEffect, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';

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

  // Sticky-on-scroll: the header + filter row + separator stay pinned to
  // the top of the scroll viewport while the grid scrolls underneath. An
  // IntersectionObserver watches a zero-height sentinel placed just
  // above the sticky band; once the sentinel scrolls out of the
  // viewport, the band is "stuck" and we drop a subtle shadow beneath
  // it. Root is the ScrollArea viewport (Base UI's primitive emits
  // `data-slot="scroll-area-viewport"`) so the observer measures
  // against the right scroller, not the window. Declared up here ahead
  // of the empty-state early-return so the hook order stays stable.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = el.closest('[data-slot="scroll-area-viewport"]');
    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      root,
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      {/* Gray panel background lives on the ScrollArea so it paints behind the
          transparent viewport and fills the bottom gutter (pb-3). The right
          gutter is applied to the grid alone (below), not the ScrollArea, so the
          white header band spans the full panel width instead of being cut short
          by a right inset. No left inset → background, Separator, and grid sit
          flush against the chat panel's right border; header + filters use px-3
          to keep their text off the divider and the right edge. Top spacing
          lives on the sticky band (pt-3) so no gray strip lands above it. */}
      <ScrollArea className="h-full bg-udi-gray-100 pb-3">
        <div className="flex flex-col">
          <div ref={sentinelRef} aria-hidden />
          {/* No pb here: the Separator is the band's bottom edge so the stuck
              shadow casts straight onto the gray grid instead of a white chin. */}
          <div
            className={cn(
              'sticky top-0 z-10 flex flex-col gap-3 bg-background pt-3 transition-shadow',
              isStuck && 'shadow-md',
            )}
          >
            <div className="px-3">
              <DashboardHeader />
            </div>
            <div className="px-3">
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
          </div>
          {/* Right gutter on the grid alone so the header band above stays
              full-width; grid width is unchanged (the inset just moved here
              from the ScrollArea). */}
          <div className="pr-3">
            <DashboardGrid selections={mergedSelections} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
