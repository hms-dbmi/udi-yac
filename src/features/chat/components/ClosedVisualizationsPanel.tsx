import { useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { useMemoryBank, useDashboardStore, useMemoryBankStore } from '@/app/UDIChatContext';

/**
 * Renders a strip of recently-closed visualizations with per-item restore
 * buttons. Subscribes to `memoryBank.closedVisualizations` in isolation so
 * that closing/restoring a viz does not re-render the parent ChatPanel.
 */
export function ClosedVisualizationsPanel() {
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore);
    },
    [dashboardStore, memoryBankStore],
  );

  if (closedVisualizations.size === 0) return null;

  return (
    <div className="px-3 py-1.5 border-t">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        Recently Closed
      </p>
      <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto">
        {Array.from(closedVisualizations.entries()).map(([key, viz]) => (
          <button
            key={key}
            className="flex items-center gap-1.5 text-xs text-left hover:bg-muted rounded px-1.5 py-0.5 w-full"
            onClick={() => handleRestore(key)}
          >
            <RotateCw className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{viz.title ?? viz.userPrompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
