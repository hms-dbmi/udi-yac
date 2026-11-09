import { useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { UDIVis } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useMemoryBank,
  useDashboardStore,
  useMemoryBankStore,
  useDataPackage,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import { usePalette } from 'udi-toolkit/react';
import { applyFieldLabels, resolveVizTitle, useVizTitleLabels } from '@/features/dashboard';

/**
 * Modal listing every visualization in the memory bank with a per-item restore
 * action, opened from the chat header's menu. Subscribes to
 * `memoryBank.closedVisualizations` directly so opening/closing the modal does
 * not re-render the rest of the chat header.
 */
export function MemoryBankDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const palette = usePalette();
  const titleLabels = useVizTitleLabels();
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const dataPackageStore = useDataPackageStore();

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore, dataPackageStore);
    },
    [dashboardStore, memoryBankStore, dataPackageStore],
  );

  const entries = Array.from(closedVisualizations.entries());
  const hasEntries = entries.length > 0;

  // Force `open` back to false whenever the bank empties (the user restored
  // the last entry), or a stale `open: true` would resurrect the dialog with
  // the next removal. Clamp during render (React's
  // conditional-setState-in-render pattern) instead of from an effect to keep
  // this lint-clean.
  if (!hasEntries && open) {
    onOpenChange(false);
  }

  return (
    <Dialog open={open && hasEntries} onOpenChange={onOpenChange}>
      <DialogContent className="udi:sm:max-w-2xl udi:max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="udi:text-sm">Memory Bank</DialogTitle>
        </DialogHeader>
        <div className="udi:flex udi:flex-col udi:gap-3 udi:overflow-y-auto udi:max-h-[50vh] udi:[scrollbar-gutter:stable]">
          {entries.map(([key, viz]) => (
            <div
              key={key}
              className="udi:flex udi:flex-col udi:gap-1 udi:rounded udi:border udi:border-border udi:p-2"
            >
              <div className="udi:flex udi:items-center udi:gap-2">
                <span
                  className="udi:flex-1 udi:truncate udi:text-sm udi:text-foreground"
                  title={viz.userPrompt}
                >
                  {resolveVizTitle(viz, titleLabels)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="udi:shrink-0"
                  onClick={() => handleRestore(key)}
                >
                  <RotateCw className="udi:h-3 udi:w-3" />
                  Restore to dashboard
                </Button>
              </div>
              <div className="udi:h-48 udi:w-full udi:overflow-hidden">
                <UDIVis
                  className="udi:block udi:h-full udi:w-full"
                  spec={applyFieldLabels(viz.interactiveSpec, titleLabels)}
                  sourceResolver={sourceResolver}
                  palette={palette}
                  fillContainer
                />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
