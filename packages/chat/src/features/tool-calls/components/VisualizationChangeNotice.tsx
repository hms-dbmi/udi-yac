import { useCallback, useMemo } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { UDIGrammar } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buildVizTitle, useVizTitleLabels, vizTitleProvenance } from '@/features/dashboard';
import {
  useDashboard,
  useDashboardStore,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
  useTracker,
} from '@/app/UDIChatContext';

interface VisualizationChangeNoticeProps {
  vizKey: string;
  /** The spec exactly as the assistant produced it — also the reset target. */
  originalSpec: UDIGrammar;
}

/**
 * Reports how the live dashboard card differs from the message that created
 * it. The transcript keeps showing what the assistant produced, so without
 * this a renamed or re-tweaked card reads as a different chart entirely.
 *
 * Two independent changes, each with its own undo, listed in the order they
 * happen to the chart — the fields first, then what it ended up called:
 *   - swapped chart fields → reset the spec (discards work, so it confirms)
 *   - a user rename        → dismiss the custom name (cheap, no confirmation)
 * Resetting deliberately leaves a custom name alone: the two are separate
 * decisions and each row undoes only its own change.
 */
export function VisualizationChangeNotice({
  vizKey,
  originalSpec,
}: VisualizationChangeNoticeProps) {
  const viz = useDashboard((s) => s.activeVisualizations.get(vizKey));
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const trackEvent = useTracker();

  const titleLabels = useVizTitleLabels();
  const provenance = useMemo(
    () => (viz ? vizTitleProvenance(viz, titleLabels) : null),
    [viz, titleLabels],
  );

  // The transcript header names the assistant's spec; this names the card as it
  // stands now. Only worth saying when a tweak actually moved it.
  const retitled = useMemo(() => {
    if (!viz) return null;
    const current = buildVizTitle(viz.spec, titleLabels);
    return current && current !== buildVizTitle(originalSpec, titleLabels) ? current : null;
  }, [viz, originalSpec, titleLabels]);

  // Compared by value, not reference: the card's spec is re-created by every
  // field swap, and an import rebuilds it from JSON. Both specs are small.
  const tweaked = useMemo(
    () => !!viz && JSON.stringify(viz.spec) !== JSON.stringify(originalSpec),
    [viz, originalSpec],
  );

  const dismissRename = useCallback(() => {
    dashboardStore.getState().setVisualizationTitle(vizKey, '');
    trackEvent('visualization_renamed', { cleared: true, source: 'transcript' });
  }, [vizKey, dashboardStore, trackEvent]);

  const resetVisualization = useCallback(() => {
    // Clone so the card never shares a spec object with the message it came
    // from, and re-apply the filter transformations the swap path also
    // reapplies (null filters + named cross-chart filters).
    const pristine = JSON.parse(JSON.stringify(originalSpec)) as UDIGrammar;
    dashboardStore.getState().updateActiveVisualizationSpec(vizKey, pristine, sourceFields);
    dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
    trackEvent('visualization_reset', { source: 'transcript' });
  }, [
    vizKey,
    originalSpec,
    sourceFields,
    dashboardStore,
    dataFiltersStore,
    dataPackageStore,
    trackEvent,
  ]);

  if (!viz || !provenance) return null;
  const { display, isRenamed } = provenance;
  if (!isRenamed && !tweaked) return null;

  return (
    // Each row puts its undo control hard against the right edge, so the two
    // buttons line up in a column however long the text beside them runs.
    <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {tweaked && (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {/* A custom name already tells the user what the chart is called,
                so naming the generated title too would just be noise. */}
            {retitled && !isRenamed ? (
              <>
                Fields changed — now titled <span className="italic">{retitled}</span>
              </>
            ) : (
              'Fields changed'
            )}
          </span>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 shrink-0"
                  title="Reset the visualization to its original fields"
                  aria-label="Reset visualization"
                />
              }
            >
              <RotateCcw className="h-3 w-3" />
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Reset this visualization?</DialogTitle>
                <DialogDescription>
                  The chart goes back to the fields the assistant originally chose, discarding every
                  change made with the tweak controls. Filters and any custom name are left as they
                  are.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
                <DialogClose render={<Button size="sm" onClick={resetVisualization} />}>
                  Reset
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {isRenamed && (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            Renamed to <span className="italic">{display}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5 shrink-0"
            title="Remove the custom name"
            aria-label="Remove custom name"
            onClick={dismissRename}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
