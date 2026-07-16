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
  Loader2,
  Columns3,
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
  useGlobal,
  useTracker,
} from '@/app/UDIChatContext';
import { VizTweakComponent } from './VizTweakComponent';
import { cn } from '@/lib/utils';
import { DRAG_HANDLE_CLASS } from '../utils/gridDefaults';
import { hasTweakableFields } from '../utils/tweakability';
import { buildRelevantRowMapping } from '../utils/relevantTableMapping';

interface DashboardCardProps {
  vizKey: string;
  viz: ActiveVisualization;
  selections: DataSelections;
}

export function DashboardCard({ vizKey, viz, selections }: DashboardCardProps) {
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  // Remote (non-interactive) mode: true while a batched server round-trip is
  // updating the dashboard — drives the per-card loading overlay.
  const remoteQueryPending = useDataPackage((s) => s.remoteQueryPending);
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

  // Brushes flow directly into the shared Pinia DataSourcesStore via
  // UDIVis's Vega signal handlers, so we no longer mirror them to a
  // React store — no `onSelectionChange` handler needed here.

  const [showTweak, setShowTweak] = useState(false);
  const [copied, setCopied] = useState(false);
  // Table view defaults to the fields relevant to the visualization (chart
  // mappings + entity key columns); toggled to all fields per card.
  const [showAllFields, setShowAllFields] = useState(false);
  const getKeyFields = useDataPackage((s) => s.getKeyFields);

  // For table view: replace the chart representation with a row layer —
  // relevant fields by default, or all fields ('*') when toggled.
  const tableSpec = useMemo(() => {
    if (!isTableView) return plainSpec;
    const s = JSON.parse(JSON.stringify(plainSpec));
    delete s.representation;
    if (!showAllFields) {
      const source = Array.isArray(viz.spec.source) ? viz.spec.source[0] : viz.spec.source;
      const keyFields = source?.name ? getKeyFields(source.name) : [];
      const mapping = buildRelevantRowMapping(viz.spec, keyFields);
      if (mapping) {
        s.representation = { mark: 'row', mapping };
      }
    }
    return s;
  }, [plainSpec, isTableView, showAllFields, viz.spec, getKeyFields]);

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
          {isTableView && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6', showAllFields && 'text-primary')}
                    onClick={() => setShowAllFields((v) => !v)}
                  />
                }
              >
                <Columns3 className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                {showAllFields ? 'Show relevant fields only' : 'Show all fields'}
              </TooltipContent>
            </Tooltip>
          )}
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
      <CardContent className="relative p-1 flex-1 min-h-0 overflow-hidden">
        {remoteQueryPending && (
          // Non-blocking corner indicator: the chart stays visible and
          // interactive in its current state while the round-trip is in
          // flight. Delay-shown (300ms, backwards fill keeps it invisible
          // during the delay) so fast responses cause no visual change.
          <div
            className="pointer-events-none absolute top-1 right-1 z-10 animate-in fade-in duration-150"
            style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}
          >
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <UDIVis
          className="block h-full w-full"
          key={isTableView ? `table-${specKey}` : specKey}
          spec={isTableView ? tableSpec : plainSpec}
          selections={externalSelections}
          sourceResolver={sourceResolver}
          palette={palette}
          fillContainer
        />
      </CardContent>
    </Card>
  );
}
