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
import { setMappingFieldByEncoding, collectLockedFields } from '@/utils/specMutations';
import type { TweakableParam, LayerLike, MappingLike } from './VizTweakComponent.types';

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

  const sourceName = useMemo(() => {
    const src = Array.isArray(spec.source)
      ? (spec.source as Array<{ name?: string }>)[0]
      : (spec.source as { name?: string });
    return src?.name ?? null;
  }, [spec.source]);

  // Fields referenced by schema-defining transformations (groupby, binby,
  // rollup.field, kde, join.on). Swapping a mapping that references one of
  // these would leave the pipeline pointing at the old field, silently
  // breaking the chart — so such mappings are hidden from the tweak UI.
  const lockedFields = useMemo(() => collectLockedFields(spec), [spec]);

  const tweakableParams = useMemo<TweakableParam[]>(() => {
    if (!spec.representation) return [];
    const representations = (
      Array.isArray(spec.representation) ? spec.representation : [spec.representation]
    ) as LayerLike[];

    const allMappings: MappingLike[] = [];
    for (const layer of representations) {
      if (layer.mark === 'row') continue;
      const mappings: MappingLike[] = Array.isArray(layer.mapping)
        ? layer.mapping
        : layer.mapping
          ? [layer.mapping]
          : [];
      allMappings.push(...mappings);
    }

    const entityFields = sourceName ? (sourceFields?.[sourceName] ?? []) : [];
    const seen = new Set<string>();

    const isComplete = (
      m: MappingLike,
    ): m is Required<Pick<MappingLike, 'field' | 'encoding' | 'type'>> =>
      Boolean(m?.field && m?.encoding && m?.type);

    return allMappings
      .filter(isComplete)
      .filter((m) => entityFields.includes(m.field))
      .filter((m) => !lockedFields.has(m.field))
      .filter((m) => {
        if (seen.has(m.encoding)) return false;
        seen.add(m.encoding);
        return true;
      })
      .map((m) => ({
        field: m.field as string,
        encoding: m.encoding as string,
        options:
          m.type === 'quantitative'
            ? sourceName
              ? (quantitativeSourceFields?.[sourceName] ?? [])
              : []
            : sourceName
              ? (categoricalSourceFields?.[sourceName] ?? [])
              : [],
      }));
  }, [
    spec,
    sourceName,
    sourceFields,
    quantitativeSourceFields,
    categoricalSourceFields,
    lockedFields,
  ]);

  const handleFieldChange = useCallback(
    (encoding: string, newField: string | null) => {
      if (!newField) return;
      const updatedSpec = setMappingFieldByEncoding(spec, encoding, newField);
      // Reference-equal when the helper detected a no-op (encoding not found
      // or already bound to newField). Skip the store update in that case.
      if (updatedSpec === spec) return;

      const vizKey = dashboardStore.getState().vizKey(messageIndex, toolCallIndex);
      dashboardStore.getState().updateActiveVisualizationSpec(vizKey, updatedSpec, sourceFields);
      // Reapply filter transformations to the updated spec (null filters, named filters)
      dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
      trackEvent('visualization_tweaked', { encoding });
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
          onValueChange={(val) => handleFieldChange(param.encoding, val)}
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
