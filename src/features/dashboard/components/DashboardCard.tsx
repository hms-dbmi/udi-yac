import { useCallback, useMemo, useState } from 'react';
import { UDIVis } from 'udi-toolkit/react';
import type { DataSelections } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { X, Settings2, Code2, Copy, Check, Table2, BarChart3, ExternalLink } from 'lucide-react';
import { compressToEncodedURIComponent } from 'lz-string';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ActiveVisualization } from '../stores/dashboardStore';
import {
  useDashboard,
  useDashboardStore,
  useSelectionsStore,
  useMemoryBankStore,
  useDataPackage,
  useGlobal,
  useTracker,
} from '@/app/UDIChatContext';
import { VizTweakComponent } from './VizTweakComponent';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  vizKey: string;
  viz: ActiveVisualization;
  selections: DataSelections;
}

export function DashboardCard({ vizKey, viz, selections }: DashboardCardProps) {
  const dashboardStore = useDashboardStore();
  const selectionsStore = useSelectionsStore();
  const memoryBankStore = useMemoryBankStore();
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const trackEvent = useTracker();
  const debugMode = useGlobal((s) => s.debugMode);
  const isTableView = useDashboard((s) => s.isTableView(vizKey));
  const isHovered = useDashboard((s) => s.hoveredVisualizationIndex === vizKey);

  const plainSpec = useMemo(
    () => JSON.parse(JSON.stringify(viz.interactiveSpec)),
    [viz.interactiveSpec],
  );

  // Fingerprint the spec so we can force UDIVis to remount when the spec
  // content changes — the Vue CE may not reliably re-render on prop updates
  // alone despite the useLayoutEffect fix in the wrapper.
  const specKey = useMemo(() => {
    const s = viz.interactiveSpec;
    const repr = JSON.stringify(s.representation);
    const src = JSON.stringify(s.source);
    return `${src}|${repr}`;
  }, [viz.interactiveSpec]);

  const externalSelections = useMemo(() => {
    const filtered: DataSelections = {};
    for (const [key, val] of Object.entries(selections)) {
      if (key !== viz.uuid) filtered[key] = val;
    }
    return JSON.parse(JSON.stringify(filtered)) as DataSelections;
  }, [selections, viz.uuid]);

  const handleClose = useCallback(() => {
    dashboardStore.getState().closeVisualization(vizKey, memoryBankStore);
    trackEvent('visualization_closed', { hasTitle: !!viz.title });
  }, [dashboardStore, vizKey, memoryBankStore, trackEvent, viz.title]);

  const handleSelectionChange = useCallback(
    (newSelections: DataSelections) => {
      const plain = JSON.parse(JSON.stringify(newSelections)) as DataSelections;
      // Brushes propagate through selectionsStore only. We intentionally do
      // NOT write them into dataFiltersStore.internalDataSelections anymore,
      // so brushes don't appear as filter chips in the toolbar. Cross-chart
      // filtering still works via the shared Pinia DataSourcesStore +
      // named-filter entries in each viz's interactiveSpec.transformation.
      selectionsStore.getState().updateSelections(plain);
    },
    [selectionsStore],
  );

  const [showTweak, setShowTweak] = useState(false);
  const [copied, setCopied] = useState(false);

  // For table view: strip representation so UDIVis renders as a table
  const tableSpec = useMemo(() => {
    if (!isTableView) return plainSpec;
    const s = JSON.parse(JSON.stringify(plainSpec));
    delete s.representation;
    return s;
  }, [plainSpec, isTableView]);

  const specJson = useMemo(() => JSON.stringify(viz.spec, null, 2), [viz.spec]);

  const specEditorUrl = useMemo(() => {
    const compressed = compressToEncodedURIComponent(specJson);
    return `https://hms-dbmi.github.io/udi-grammar/#/Editor?spec=${compressed}`;
  }, [specJson]);

  const handleCopySpec = useCallback(() => {
    navigator.clipboard.writeText(specJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [specJson]);

  return (
    <Card
      className={cn('relative transition-shadow', isHovered && 'ring-2 ring-primary/40')}
      onMouseEnter={() => dashboardStore.getState().setHoveredVisualizationIndex(vizKey)}
      onMouseLeave={() => dashboardStore.getState().setHoveredVisualizationIndex(null)}
    >
      <CardHeader className="p-2 pb-0 flex flex-col gap-1">
        <div className="flex items-center w-full">
          <span className="text-xs inline-block font-medium truncate flex-1">
            {viz.title ?? viz.userPrompt}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-auto"
                  onClick={handleClose}
                />
              }
            >
              <X className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowTweak((v) => !v)}
                />
              }
            >
              <Settings2 className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent>Tweak fields</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => dashboardStore.getState().toggleTableView(vizKey)}
                />
              }
            >
              {isTableView ? <BarChart3 className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}
            </TooltipTrigger>
            <TooltipContent>{isTableView ? 'Show chart' : 'Show table'}</TooltipContent>
          </Tooltip>
          {debugMode && (
            <Dialog>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DialogTrigger
                      render={<Button variant="ghost" size="icon" className="h-6 w-6" />}
                    >
                      <Code2 className="h-3 w-3" />
                    </DialogTrigger>
                  }
                />
                <TooltipContent>View spec</TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="text-sm">UDI Grammar Spec</DialogTitle>
                </DialogHeader>
                <div className="relative">
                  <div className="flex gap-1 absolute top-1 right-1">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleCopySpec}
                          />
                        }
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent>{copied ? 'Copied' : 'Copy spec'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => window.open(specEditorUrl, '_blank')}
                          />
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Open in UDI Grammar Editor</TooltipContent>
                    </Tooltip>
                  </div>
                  <pre className="text-xs overflow-auto max-h-[60vh] bg-muted p-3 rounded-md">
                    {specJson}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      {showTweak && (
        <div className="px-2 pt-1">
          <VizTweakComponent
            spec={viz.spec}
            messageIndex={viz.index}
            toolCallIndex={viz.toolCallIndex}
          />
        </div>
      )}
      <CardContent className="p-2">
        <UDIVis
          className="block w-full"
          key={isTableView ? `table-${specKey}` : specKey}
          spec={isTableView ? tableSpec : plainSpec}
          selections={externalSelections}
          sourceResolver={sourceResolver}
          onSelectionChange={handleSelectionChange}
        />
      </CardContent>
    </Card>
  );
}
