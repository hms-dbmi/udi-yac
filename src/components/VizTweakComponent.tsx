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
} from '@/stores/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import { setMappingFieldByEncoding } from '@/utils/specMutations';

interface TweakableParam {
  field: string;
  encoding: string;
  options: string[];
}

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

  const sourceName = useMemo(() => {
    const src = Array.isArray(spec.source) ? (spec.source as any)[0] : spec.source;
    return src?.name ?? null;
  }, [spec.source]);

  const tweakableParams = useMemo<TweakableParam[]>(() => {
    if (!spec.representation) return [];
    const representations = Array.isArray(spec.representation)
      ? spec.representation
      : [spec.representation];

    const allMappings: any[] = [];
    for (const layer of representations) {
      if ((layer as any).mark === 'row') continue;
      const mappings = Array.isArray((layer as any).mapping)
        ? (layer as any).mapping
        : [(layer as any).mapping];
      allMappings.push(...mappings);
    }

    const entityFields = sourceName ? (sourceFields?.[sourceName] ?? []) : [];
    const seen = new Set<string>();

    return allMappings
      .filter((m) => m?.field && m?.encoding && m?.type)
      .filter((m) => entityFields.includes(m.field))
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
  }, [spec, sourceName, sourceFields, quantitativeSourceFields, categoricalSourceFields]);

  const handleFieldChange = useCallback(
    (encoding: string, newField: string | null) => {
      if (!newField) return;
      const updatedSpec = setMappingFieldByEncoding(spec, encoding, newField);
      // Reference-equal when the helper detected a no-op (encoding not found
      // or already bound to newField). Skip the store update in that case.
      if (updatedSpec === spec) return;

      const pinKey = dashboardStore.getState().pinKey(messageIndex, toolCallIndex);
      dashboardStore.getState().updatePinnedVisualizationSpec(pinKey, updatedSpec, sourceFields);
      // Reapply filter transformations to the updated spec (null filters, named filters)
      dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
    },
    [
      spec,
      dashboardStore,
      dataFiltersStore,
      dataPackageStore,
      messageIndex,
      toolCallIndex,
      sourceFields,
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
