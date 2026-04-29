import { useCallback, useState } from 'react';
import { Archive, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemoryBank, useDashboardStore, useMemoryBankStore } from '@/app/UDIChatContext';

/**
 * Opens a modal listing every visualization in the memory bank with a per-item
 * restore action. Subscribes to `memoryBank.closedVisualizations` directly so
 * opening/closing the modal does not re-render the rest of the chat header.
 */
export function MemoryBankButton() {
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const [open, setOpen] = useState(false);

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore);
    },
    [dashboardStore, memoryBankStore],
  );

  if (closedVisualizations.size === 0) return null;

  const entries = Array.from(closedVisualizations.entries());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="max-w-md max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">Memory Bank</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[50vh]">
          {entries.map(([key, viz]) => (
            <div key={key} className="flex items-center gap-2 rounded px-2 py-1.5">
              <span className="flex-1 truncate text-sm text-foreground" title={viz.userPrompt}>
                {viz.title ?? viz.userPrompt}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleRestore(key)}
                title="Restore to dashboard"
              >
                <RotateCw className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
