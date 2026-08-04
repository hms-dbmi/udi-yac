import { useMemo, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useApiConfig,
  useDataPackage,
  useDashboard,
  useDashboardStore,
  useDataFiltersStore,
  useDataPackageStore,
  useTracker,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import { swapPlainField, swapDimensionField, swapMeasureField } from '@/utils/specMutations';
import { computeTweakableParams } from '../utils/tweakability';
import { useTemplateRebind } from '../hooks/useTemplateRebind';
import type { TweakableParam } from './VizTweakComponent.types';

interface VizTweakComponentProps {
  spec: UDIGrammar;
  messageIndex: number;
  toolCallIndex: number;
}

export function VizTweakComponent({ spec, messageIndex, toolCallIndex }: VizTweakComponentProps) {
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const quantitativeSourceFields = useDataPackage((s) => s.quantitativeSourceFields);
  const categoricalSourceFields = useDataPackage((s) => s.categoricalSourceFields);
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const trackEvent = useTracker();
  const apiConfig = useApiConfig();

  const vizKey = `${messageIndex}-${toolCallIndex}`;
  // Subscribed rather than passed in, so the panel reflects the bindings a
  // re-bind just accepted.
  const viz = useDashboard((s) => s.activeVisualizations.get(vizKey));
  const template = viz?.template;

  const { rebind, pendingParam, error } = useTemplateRebind(vizKey, template);

  const tweakableParams = useMemo<TweakableParam[]>(
    () =>
      computeTweakableParams(
        spec,
        sourceFields,
        quantitativeSourceFields,
        categoricalSourceFields,
        // Without a reachable agent a re-bind cannot happen, so don't offer one.
        apiConfig.apiBaseUrl ? template : undefined,
      ),
    [
      spec,
      sourceFields,
      quantitativeSourceFields,
      categoricalSourceFields,
      template,
      apiConfig.apiBaseUrl,
    ],
  );

  const handleFieldChange = useCallback(
    (param: TweakableParam, newField: string | null) => {
      if (!newField) return;
      if (param.kind === 'binding') {
        void rebind(param.param, newField);
        return;
      }
      let updatedSpec: UDIGrammar;
      switch (param.kind) {
        case 'dimension':
          // Rewrite this encoding's mapping and keep the groupby in sync, so the
          // aggregation regroups on the new field without disturbing another
          // encoding bound to the same dimension.
          updatedSpec = swapDimensionField(spec, param.encoding, newField);
          break;
        case 'measure':
          // Rewrite the rollup's input field (+ its output column) so the
          // aggregation recomputes over the new measure.
          updatedSpec = param.outputKey ? swapMeasureField(spec, param.outputKey, newField) : spec;
          break;
        default:
          // Plain field swap: rewrite this encoding's mapping AND follow the
          // field through orderby/filter (e.g. a CDF orders by and drops nulls
          // of the plotted field), so it doesn't stay ordered/filtered by the old one.
          updatedSpec = swapPlainField(spec, param.encoding, newField);
      }
      // Reference-equal when the mutation was a no-op (unchanged field, encoding
      // not found, etc.). Skip the store update in that case.
      if (updatedSpec === spec) return;

      dashboardStore.getState().updateActiveVisualizationSpec(vizKey, updatedSpec, sourceFields);
      // Reapply filter transformations to the updated spec (null filters, named filters)
      dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
      trackEvent('visualization_tweaked', { encoding: param.encoding, kind: param.kind });
    },
    [
      spec,
      dashboardStore,
      dataFiltersStore,
      dataPackageStore,
      rebind,
      vizKey,
      sourceFields,
      trackEvent,
    ],
  );

  // A chart that isn't on the dashboard has nothing to update: the store keys
  // tweaks by viz, so offering controls here would be offering dead ones.
  if (!viz) return null;
  if (tweakableParams.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        {tweakableParams.map((param) => (
          <Select
            key={param.kind === 'binding' ? param.param : param.encoding}
            value={param.field}
            // A re-bind replaces the whole spec, so a second concurrent edit
            // would be applied to a chart that is about to be replaced.
            disabled={pendingParam !== null}
            onValueChange={(val) => handleFieldChange(param, val)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
              <span className="text-muted-foreground mr-1">{param.label}:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {param.options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      {error && (
        <p role="status" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
