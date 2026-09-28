import { useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import {
  useMemoryBank,
  useDashboardStore,
  useMemoryBankStore,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import { resolveVizTitle, useVizTitleLabels } from '@/features/dashboard';

/**
 * Renders a strip of recently-closed visualizations with per-item restore
 * buttons. Subscribes to `memoryBank.closedVisualizations` in isolation so
 * that closing/restoring a viz does not re-render the parent ChatPanel.
 */
export function ClosedVisualizationsPanel() {
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const dataPackageStore = useDataPackageStore();
  const titleLabels = useVizTitleLabels();

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore, dataPackageStore);
    },
    [dashboardStore, memoryBankStore, dataPackageStore],
  );

  if (closedVisualizations.size === 0) return null;

  return (
    <div className="udi:px-3 udi:py-1.5 udi:border-t">
      <p className="udi:text-[10px] udi:font-medium udi:text-muted-foreground udi:uppercase udi:tracking-wider udi:mb-1">
        Recently Closed
      </p>
      <div className="udi:flex udi:flex-col udi:gap-0.5 udi:max-h-20 udi:overflow-y-auto">
        {Array.from(closedVisualizations.entries()).map(([key, viz]) => (
          <button
            key={key}
            className="udi:flex udi:items-center udi:gap-1.5 udi:text-xs udi:text-left udi:hover:bg-muted udi:rounded udi:px-1.5 udi:py-0.5 udi:w-full"
            onClick={() => handleRestore(key)}
          >
            <RotateCw className="udi:h-3 udi:w-3 udi:shrink-0 udi:text-muted-foreground" />
            <span className="udi:truncate">{resolveVizTitle(viz, titleLabels)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
