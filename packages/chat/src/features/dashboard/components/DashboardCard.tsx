import { useCallback, useMemo, useState } from 'react';
import { UDIVis, describeTransformations } from 'udi-toolkit/react';
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
  Info,
  Crosshair,
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
  useConversation,
  useDashboard,
  useDashboardStore,
  useMemoryBankStore,
  useDataPackage,
  useDataFiltersStore,
  useGlobal,
  useTracker,
} from '@/app/UDIChatContext';
import { VizTweakComponent } from './VizTweakComponent';
import { EditableCardTitle } from './EditableCardTitle';
import { applyFieldLabels, resolveVizSummary } from '../utils/vizTitle';
import { useVizTitleLabels } from '../hooks/useVizTitleLabels';
import { cn } from '@/lib/utils';
import { DRAG_HANDLE_CLASS } from '../utils/gridDefaults';
import { hasTweakableFields } from '../utils/tweakability';
import { buildRelevantRowMapping } from '../utils/relevantTableMapping';
import { useJumpTarget } from '@/hooks/useJumpTarget';

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
  // Remote (non-interactive) mode: true while a batched server round-trip is
  // updating the dashboard — drives the per-card loading overlay.
  const remoteQueryPending = useDataPackage((s) => s.remoteQueryPending);
  const palette = usePalette();
  const trackEvent = useTracker();
  const debugMode = useGlobal((s) => s.debugMode);
  const readOnly = useGlobal((s) => s.readOnly);
  // A card from a hidden message has no bubble to jump to.
  const messageHidden = useConversation((s) => viz.index < s.hiddenCount);
  const isTableView = useDashboard((s) => s.isTableView(vizKey));
  // Highlight when this card is hovered directly, or when the chat is pointing
  // at it (its single-viz message, or its accordion item in a multi-viz
  // message). Hover never scrolls — the chat's jump button does that.
  const isSelfHovered = useDashboard((s) => s.hoveredVisualizationIndex === vizKey);
  const isMessageHovered = useDashboard((s) => s.hoveredMessageVizKey === vizKey);
  const isHovered = isSelfHovered || isMessageHovered;

  // "Show visualization in dashboard" pressed on this card's chat message.
  const jump = useDashboard((s) => s.jumpToVisualization);
  // `block: 'start'` — a card is usually taller than a message, and its title
  // and toolbar are at the top, so land the top edge rather than the bottom.
  const { ref: cardRef, flashing } = useJumpTarget<HTMLDivElement>(
    jump?.key === vizKey ? jump.nonce : null,
    { block: 'start' },
  );

  // Whether the gear button can do anything for this spec. Charts whose
  // mappings only reference computed / locked fields (count of groupby,
  // binby outputs, kde outputs) have nothing tweakable — toggling the
  // panel would just render `null`. Disable the button + swap the
  // tooltip in that case so the affordance matches reality.
  const tweakable = useMemo(
    () => hasTweakableFields(viz.spec, sourceFields, viz.template),
    [viz.spec, sourceFields, viz.template],
  );

  // Field labels go on at render time, not in the store: the toolkit turns each
  // mapping's `title` into the Vega encoding title, so axes, legends and tooltips
  // read "Weight" while the stored spec keeps `weight_value` for export, the
  // reset comparison and the query compiler.
  const titleLabels = useVizTitleLabels();
  const plainSpec = useMemo(
    () => applyFieldLabels(JSON.parse(JSON.stringify(viz.interactiveSpec)), titleLabels),
    [viz.interactiveSpec, titleLabels],
  );

  // Fingerprint the spec so we can force UDIVis to remount when the spec
  // content changes — the Vue CE may not reliably re-render on prop updates
  // alone despite the useLayoutEffect fix in the wrapper. Fingerprinting the
  // *labelled* spec means labels arriving late (the package loads after the
  // card mounts) also force the remount that picks them up.
  const specKey = useMemo(() => {
    const repr = JSON.stringify(plainSpec.representation);
    const src = JSON.stringify(plainSpec.source);
    return `${src}|${repr}`;
  }, [plainSpec]);

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
    trackEvent('visualization_closed', { hasTitle: !!viz.title, renamed: !!viz.userTitle });
  }, [dashboardStore, vizKey, memoryBankStore, trackEvent, viz.title, viz.userTitle]);

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
  // While the title is being renamed the header collapses to just the field
  // and its accept/cancel buttons: the row is too narrow to hold both, and
  // hiding the grip also stops a stray drag mid-edit.
  const [editingTitle, setEditingTitle] = useState(false);
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

  // Plain-language summary of the transformation pipeline, shown as an info
  // tooltip (in both chart and table views) so the user can see how the
  // displayed data was derived (grouped, aggregated, sorted, …).
  const transformSteps = useMemo(() => describeTransformations(viz.spec), [viz.spec]);

  // The visualization template's own one-line explanation, resolved against the
  // live spec. Leads the info tooltip because it says what the chart shows;
  // the step list stays underneath for anyone who wants the mechanics.
  const summary = useMemo(() => resolveVizSummary(viz, titleLabels), [viz, titleLabels]);

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
      // Something for a popover opened inside this card to anchor against, so
      // it can sit beside the card instead of on top of the chart it belongs
      // to. Read with `closest()` rather than passed down, because the tweak
      // row is shared with the chat bubble, which has no card to anchor to.
      data-udi-viz-card=""
      className={cn(
        // py-2/gap-2 override the shared Card defaults (py-4/gap-4) to give the
        // visualization more room — the dominant vertical chrome inside a card.
        'udi:relative udi:transition-shadow udi:h-full udi:flex udi:flex-col udi:min-h-0 udi:py-2 udi:gap-2',
        (isHovered || flashing) && 'udi:ring-3 udi:ring-primary/40',
      )}
      onMouseEnter={() => dashboardStore.getState().setHoveredVisualizationIndex(vizKey)}
      onMouseLeave={() => dashboardStore.getState().setHoveredVisualizationIndex(null)}
    >
      <CardHeader className="udi:p-1 udi:pb-0 udi:shrink-0">
        <div className="udi:flex udi:items-center udi:w-full udi:min-w-0 udi:gap-0.5">
          {!editingTitle && !readOnly && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'udi:h-6 udi:w-6 udi:cursor-grab udi:active:cursor-grabbing udi:touch-none',
                      DRAG_HANDLE_CLASS,
                    )}
                    aria-label="Drag card"
                  />
                }
              >
                <GripVertical className="udi:h-3 udi:w-3 udi:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Drag to reorder card</TooltipContent>
            </Tooltip>
          )}
          <EditableCardTitle vizKey={vizKey} viz={viz} onEditingChange={setEditingTitle} />
          {!editingTitle && (
            <>
              {!readOnly && !messageHidden && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="udi:h-6 udi:w-6"
                        aria-label="Show message in chat"
                        onClick={() => dashboardStore.getState().requestJumpToMessage(vizKey)}
                      />
                    }
                  >
                    <Crosshair className="udi:h-3 udi:w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Show message in chat</TooltipContent>
                </Tooltip>
              )}
              {tweakable && !readOnly && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="udi:h-6 udi:w-6"
                        onClick={() => setShowTweak((v) => !v)}
                      />
                    }
                  >
                    <Settings2 className="udi:h-3 udi:w-3" />
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
                      className="udi:h-6 udi:w-6"
                      onClick={() => dashboardStore.getState().toggleTableView(vizKey)}
                    />
                  }
                >
                  {isTableView ? (
                    <BarChart3 className="udi:h-3 udi:w-3" />
                  ) : (
                    <Table2 className="udi:h-3 udi:w-3" />
                  )}
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
                        className={cn('udi:h-6 udi:w-6', showAllFields && 'udi:text-primary')}
                        onClick={() => setShowAllFields((v) => !v)}
                      />
                    }
                  >
                    <Columns3 className="udi:h-3 udi:w-3" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {showAllFields ? 'Show relevant fields only' : 'Show all fields'}
                  </TooltipContent>
                </Tooltip>
              )}
              {(summary || transformSteps.length > 0) && (
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="ghost" size="icon" className="udi:h-6 udi:w-6" />}
                  >
                    <Info className="udi:h-3 udi:w-3 udi:text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="udi:max-w-xs">
                      {summary && <p className="udi:mb-1">{summary}</p>}
                      {transformSteps.length > 0 && (
                        <>
                          {summary && (
                            <div className="udi:my-1.5 udi:border-t udi:border-current/20" />
                          )}
                          <p className="udi:font-medium udi:mb-1">Transformations</p>
                          <ol className="udi:list-decimal udi:pl-4 udi:space-y-0.5">
                            {transformSteps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {debugMode && (
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon" className="udi:h-6 udi:w-6" />
                          }
                        >
                          <Code2 className="udi:h-3 udi:w-3" />
                        </DialogTrigger>
                      }
                    />
                    <TooltipContent>View spec</TooltipContent>
                  </Tooltip>
                  <DialogContent className="udi:max-w-2xl udi:max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="udi:text-sm">UDI Grammar Spec</DialogTitle>
                    </DialogHeader>
                    <div className="udi:relative">
                      <div className="udi:flex udi:gap-1 udi:absolute udi:top-1 udi:right-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="udi:h-7 udi:w-7"
                                onClick={handleCopySpec}
                              />
                            }
                          >
                            {copied ? (
                              <Check className="udi:h-3.5 udi:w-3.5 udi:text-green-600" />
                            ) : (
                              <Copy className="udi:h-3.5 udi:w-3.5" />
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
                                className="udi:h-7 udi:w-7"
                                onClick={() => window.open(specEditorUrl, '_blank')}
                              />
                            }
                          >
                            <ExternalLink className="udi:h-3.5 udi:w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>Open in UDI Grammar Editor</TooltipContent>
                        </Tooltip>
                      </div>
                      <pre className="udi:text-xs udi:overflow-auto udi:max-h-[60vh] udi:bg-muted udi:p-3 udi:rounded-md">
                        {specJson}
                      </pre>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {!readOnly && (
                <>
                  <span
                    aria-hidden
                    className="udi:mx-0.5 udi:select-none udi:text-sm udi:leading-none udi:text-muted-foreground/40"
                  >
                    |
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="udi:h-6 udi:w-6"
                          onClick={handleClose}
                        />
                      }
                    >
                      <X className="udi:h-3 udi:w-3" />
                    </TooltipTrigger>
                    <TooltipContent>Close</TooltipContent>
                  </Tooltip>
                </>
              )}
            </>
          )}
        </div>
      </CardHeader>
      {showTweak && (
        <div className="udi:px-2 udi:pt-1">
          <VizTweakComponent
            spec={viz.spec}
            messageIndex={viz.index}
            toolCallIndex={viz.toolCallIndex}
          />
        </div>
      )}
      <CardContent className="udi:relative udi:p-1 udi:flex-1 udi:min-h-0 udi:overflow-hidden">
        {remoteQueryPending && (
          // Non-blocking corner indicator: the chart stays visible and
          // interactive in its current state while the round-trip is in
          // flight. Delay-shown (300ms, backwards fill keeps it invisible
          // during the delay) so fast responses cause no visual change.
          <div
            className="udi:pointer-events-none udi:absolute udi:top-1 udi:right-1 udi:z-10 udi:animate-in udi:fade-in udi:duration-150"
            style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}
          >
            <Loader2 className="udi:h-4 udi:w-4 udi:animate-spin udi:text-muted-foreground" />
          </div>
        )}
        <UDIVis
          className="udi:block udi:h-full udi:w-full"
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
