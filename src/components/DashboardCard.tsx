import { useCallback, useMemo } from 'react';
import { UDIVis } from 'udi-toolkit/react';
import type { DataSelections } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { X } from 'lucide-react';
import type { PinnedVisualization } from '@/stores/dashboardStore';
import { useDashboardStore, useSelectionsStore } from '@/stores/UDIChatContext';

interface DashboardCardProps {
  vizKey: string;
  viz: PinnedVisualization;
  selections: DataSelections;
}

export function DashboardCard({ vizKey, viz, selections }: DashboardCardProps) {
  const dashboardStore = useDashboardStore();
  const selectionsStore = useSelectionsStore();

  // Deep-clone spec to strip any stale references before handing to the Vue CE.
  const plainSpec = useMemo(
    () => JSON.parse(JSON.stringify(viz.interactiveSpec)),
    [viz.interactiveSpec],
  );

  // Pass only *other* charts' selections — never feed a chart's own selection
  // back to itself, which would create an infinite update loop.
  const externalSelections = useMemo(() => {
    const filtered: DataSelections = {};
    for (const [key, val] of Object.entries(selections)) {
      if (key !== viz.uuid) filtered[key] = val;
    }
    return JSON.parse(JSON.stringify(filtered)) as DataSelections;
  }, [selections, viz.uuid]);

  const handleClose = useCallback(() => {
    dashboardStore.getState().unpinVisualization(vizKey);
  }, [dashboardStore, vizKey]);

  const handleSelectionChange = useCallback(
    (newSelections: DataSelections) => {
      // Deep-clone to strip Vue reactive proxies.
      const plain = JSON.parse(JSON.stringify(newSelections)) as DataSelections;
      selectionsStore.getState().updateSelections(plain);
    },
    [selectionsStore],
  );

  return (
    <Card className="relative">
      <CardHeader className="p-2 pb-0 flex-row items-center justify-between">
        <span className="text-xs font-medium truncate pr-2">
          {viz.title ?? viz.userPrompt}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-2">
        <UDIVis
          spec={plainSpec}
          selections={externalSelections}
          onSelectionChange={handleSelectionChange}
        />
      </CardContent>
    </Card>
  );
}
