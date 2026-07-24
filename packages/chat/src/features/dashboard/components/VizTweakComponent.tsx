import { useMemo, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDataPackage,
  useDashboardStore,
  useDataFiltersStore,
  useDataPackageStore,
  useTracker,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import {
  setMappingFieldByEncoding,
  swapDimensionField,
  swapMeasureField,
} from '@/utils/specMutations';
import { computeTweakableParams } from '../utils/tweakability';
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

  const tweakableParams = useMemo<TweakableParam[]>(
    () =>
      computeTweakableParams(spec, sourceFields, quantitativeSourceFields, categoricalSourceFields),
    [spec, sourceFields, quantitativeSourceFields, categoricalSourceFields],
  );

  const handleFieldChange = useCallback(
    (param: TweakableParam, newField: string | null) => {
      if (!newField) return;
      let updatedSpec: UDIGrammar;
      switch (param.kind) {
        case 'dimension':
          // Rewrite the groupby entry (+ dependent rollup output columns)
          // alongside the mapping so the aggregation regroups on the new field.
          updatedSpec = swapDimensionField(spec, param.field, newField);
          break;
        case 'measure':
          // Rewrite the rollup's input field (+ its output column) so the
          // aggregation recomputes over the new measure.
          updatedSpec = param.outputKey ? swapMeasureField(spec, param.outputKey, newField) : spec;
          break;
        default:
          updatedSpec = setMappingFieldByEncoding(spec, param.encoding, newField);
      }
      // Reference-equal when the mutation was a no-op (unchanged field, encoding
      // not found, etc.). Skip the store update in that case.
      if (updatedSpec === spec) return;

      const vizKey = dashboardStore.getState().vizKey(messageIndex, toolCallIndex);
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
      messageIndex,
      toolCallIndex,
      sourceFields,
      trackEvent,
    ],
  );

  if (tweakableParams.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tweakableParams.map((param) => (
        <Select
          key={param.encoding}
          value={param.field}
          onValueChange={(val) => handleFieldChange(param, val)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
            <span className="text-muted-foreground mr-1">{param.encoding}:</span>
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
  );
}
