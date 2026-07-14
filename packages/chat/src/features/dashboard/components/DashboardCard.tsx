import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UDIVis } from 'udi-toolkit/react';
import type { DataSelections } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  X,
  Settings2,
  Code2,
  Copy,
  Check,
  Table2,
  BarChart3,
  ExternalLink,
  GripVertical,
} from 'lucide-react';
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
import { usePalette } from 'udi-toolkit/react';
import {
  useDashboard,
  useDashboardStore,
  useMemoryBankStore,
  useDataPackage,
  useDataFiltersStore,
  useGlobal,
  useTracker,
} from '@/app/UDIChatContext';
import { VizTweakComponent } from './VizTweakComponent';
import { cn } from '@/lib/utils';
import { DRAG_HANDLE_CLASS } from '../utils/gridDefaults';
import { hasTweakableFields } from '../utils/tweakability';

interface DashboardCardProps {
  vizKey: string;
  viz: ActiveVisualization;
  selections: DataSelections;
}

export function DashboardCard({ vizKey, viz, selections }: DashboardCardProps) {
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const memoryBankStore = useMemoryBankStore();
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const palette = usePalette();
  const trackEvent = useTracker();
  const debugMode = useGlobal((s) => s.debugMode);
  const isTableView = useDashboard((s) => s.isTableView(vizKey));
  // Highlight when this card is hovered directly, or when the chat is pointing
  // at it (its single-viz message, or its accordion item in a multi-viz
  // message). Scroll only reacts to the chat-hover direction so a card's own
  // hover never scrolls the dashboard.
  const isSelfHovered = useDashboard((s) => s.hoveredVisualizationIndex === vizKey);
  const isMessageHovered = useDashboard((s) => s.hoveredMessageVizKey === vizKey);
  const isHovered = isSelfHovered || isMessageHovered;

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isMessageHovered) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isMessageHovered]);

  // Whether the gear button can do anything for this spec. Charts whose
  // mappings only reference computed / locked fields (count of groupby,
  // binby outputs, kde outputs) have nothing tweakable — toggling the
  // panel would just render `null`. Disable the button + swap the
  // tooltip in that case so the affordance matches reality.
  const tweakable = useMemo(
    () => hasTweakableFields(viz.spec, sourceFields),
    [viz.spec, sourceFields],
  );

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

  // Pass the full selection set — including this viz's OWN brush (keyed by its
  // uuid) — back to UDIVis. Feeding the own selection back lets an edit made
  // elsewhere (the chat adjustment widget, or clearing the toolbar chip) drive
  // this chart's rendered brush, and makes UDIVis bind the value into the
  // shared Pinia DataSourcesStore. UDIVis treats an external selection equal to
  // its current one as a no-op, so live brushing doesn't loop.
  const externalSelections = useMemo(
    () => JSON.parse(JSON.stringify(selections)) as DataSelections,
    [selections],
  );

  const handleClose = useCallback(() => {
    dashboardStore.getState().closeVisualization(vizKey, memoryBankStore);
    trackEvent('visualization_closed', { hasTitle: !!viz.title });
  }, [dashboardStore, vizKey, memoryBankStore, trackEvent, viz.title]);

  // Mirror brush/click selections out of the shared Pinia DataSourcesStore into
  // dataFiltersStore.internalDataSelections (keyed by viz uuid), matching the
  // LLM-filter path. The filter toolbar and chat adjustment widgets read brush
  // selections from there (see useBrushFilters). Cross-chart filtering still
  // works via the shared Pinia store + named-filter entries in each viz's
  // interactiveSpec.transformation.
  const handleSelectionChange = useCallback(
    (newSelections: DataSelections) => {
      const plain = JSON.parse(JSON.stringify(newSelections)) as DataSelections;
      dataFiltersStore.getState().updateInternalDataSelections(plain);
    },
    [dataFiltersStore],
  );

  // When this viz's own brush is cleared externally (e.g. removing its chip in
  // the filter toolbar), UDIVis offers no programmatic way to drop a rendered
  // brush rectangle. Remounting the component via a key change is the simplest
  // reliable reset. We track the brush's presence in state and bump the key on
  // the true→false transition only, so an active brush — or another viz's
  // brush — never triggers a remount loop. This uses React's "adjust state
  // during render" pattern rather than an effect.
  const ownHasBrush = selections[viz.uuid]?.selection != null;
  const [trackedHasBrush, setTrackedHasBrush] = useState(ownHasBrush);
  const [brushResetKey, setBrushResetKey] = useState(0);
  if (ownHasBrush !== trackedHasBrush) {
    setTrackedHasBrush(ownHasBrush);
    if (!ownHasBrush) setBrushResetKey((k) => k + 1);
  }

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
      ref={cardRef}
      className={cn(
        // py-2/gap-2 override the shared Card defaults (py-4/gap-4) to give the
        // visualization more room — the dominant vertical chrome inside a card.
        'relative transition-shadow h-full flex flex-col min-h-0 py-2 gap-2',
        isHovered && 'ring-3 ring-primary/40',
      )}
      onMouseEnter={() => dashboardStore.getState().setHoveredVisualizationIndex(vizKey)}
      onMouseLeave={() => dashboardStore.getState().setHoveredVisualizationIndex(null)}
    >
      <CardHeader className="p-1 pb-0 shrink-0">
        <div className="flex items-center w-full min-w-0 gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-6 w-6 cursor-grab active:cursor-grabbing touch-none',
                    DRAG_HANDLE_CLASS,
                  )}
                  aria-label="Drag card"
                />
              }
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Drag to reorder card</TooltipContent>
          </Tooltip>
          <span
            className="text-xs font-medium truncate flex-1 min-w-0"
            title={viz.title ?? viz.userPrompt}
          >
            {viz.title ?? viz.userPrompt}
          </span>
          {tweakable && (
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
          )}
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
          <span
            aria-hidden
            className="mx-0.5 select-none text-sm leading-none text-muted-foreground/40"
          >
            |
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose} />
              }
            >
              <X className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
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
      <CardContent className="p-1 flex-1 min-h-0 overflow-hidden">
        <UDIVis
          className="block h-full w-full"
          key={`${isTableView ? `table-${specKey}` : specKey}-${brushResetKey}`}
          spec={isTableView ? tableSpec : plainSpec}
          selections={externalSelections}
          onSelectionChange={handleSelectionChange}
          sourceResolver={sourceResolver}
          palette={palette}
          fillContainer
        />
      </CardContent>
    </Card>
  );
}
