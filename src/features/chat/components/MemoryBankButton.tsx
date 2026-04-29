import { useCallback, useState } from 'react';
import { Archive, RotateCw } from 'lucide-react';
import { UDIVis } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useMemoryBank,
  useDashboardStore,
  useMemoryBankStore,
  useDataPackage,
} from '@/app/UDIChatContext';

/**
 * Opens a modal listing every visualization in the memory bank with a per-item
 * restore action. Subscribes to `memoryBank.closedVisualizations` directly so
 * opening/closing the modal does not re-render the rest of the chat header.
 */
export function MemoryBankButton() {
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const [open, setOpen] = useState(false);

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore);
    },
    [dashboardStore, memoryBankStore],
  );

  const entries = Array.from(closedVisualizations.entries());
  const hasEntries = entries.length > 0;

  // Force `open` back to false whenever the bank empties. Previously the
  // component returned null on an empty bank, which unmounted the Dialog
  // mid-transition when the user restored the last entry — and a stale
  // `open: true` would then resurrect with the next removal. Clamp during
  // render (React's conditional-setState-in-render pattern) instead of
  // from an effect to keep this lint-clean.
  if (!hasEntries && open) {
    setOpen(false);
  }

  return (
    <Dialog open={open && hasEntries} onOpenChange={setOpen}>
      {hasEntries && (
        <Tooltip>
          <TooltipTrigger
            render={
              <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
                <Archive className="h-3.5 w-3.5" />
              </DialogTrigger>
            }
          />
          <TooltipContent>Memory bank</TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">Memory Bank</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[50vh] [scrollbar-gutter:stable]">
          {entries.map(([key, viz]) => (
            <div key={key} className="flex flex-col gap-1 rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-foreground" title={viz.userPrompt}>
                  {viz.title ?? viz.userPrompt}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleRestore(key)}
                >
                  <RotateCw className="h-3 w-3" />
                  Restore to dashboard
                </Button>
              </div>
              <UDIVis spec={viz.interactiveSpec} sourceResolver={sourceResolver} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
