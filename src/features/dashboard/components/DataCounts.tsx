import { useMemo, useState, useEffect } from 'react';
import { Users, FlaskConical, Table2, Loader2 } from 'lucide-react';
import { queryData } from 'udi-toolkit/react';
import type { QueryDataSpec } from 'udi-toolkit/react';
import {
  useDataPackage,
  useDashboard,
  useDataFilters,
  useDataFiltersStore,
  useDataPackageStore,
  useSelections,
} from '@/app/UDIChatContext';
import { joinDataPath } from '@/features/data-package';

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  donors: Users,
  donor: Users,
  subject: Users,
  subjects: Users,
  samples: FlaskConical,
  sample: FlaskConical,
  biosample: FlaskConical,
  biosamples: FlaskConical,
  dataset: Table2,
  datasets: Table2,
};

interface EntityChip {
  id: string;
  label: string;
  totalCount: number;
  Icon: React.ComponentType<{ className?: string }>;
}

export function DataCounts() {
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const entityNames = useDataPackage((s) => s.entityNames);
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const vizSelections = useSelections((s) => s.selections);
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();

  const [filteredCounts, setFilteredCounts] = useState<Record<string, number>>({});

  const chips = useMemo<EntityChip[]>(() => {
    if (!dataPackage?.resources) return [];
    return entityNames
      .map((name) => {
        const resource = dataPackage.resources.find((r) => r.name === name);
        const totalCount = resource?.['udi:row_count'] ?? 0;
        if (totalCount <= 1) return null;
        return {
          id: name,
          label: name,
          totalCount,
          Icon: ENTITY_ICONS[name] ?? Table2,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [dataPackage, entityNames]);

  // Build filter IDs (same logic as dashboardStore.getFilterIds)
  const filterIds = useMemo(() => {
    const vizIds = Array.from(pinnedVisualizations.values()).map((v) => v.uuid);
    const dpState = dataPackageStore.getState();
    const validSelections = dataFiltersStore.getState().getValidDataSelections({
      isValidIntervalFilter: dpState.isValidIntervalFilter,
      isValidPointFilter: dpState.isValidPointFilter,
    });
    const externalIds = Object.keys(validSelections);
    return Array.from(new Set([...vizIds, ...externalIds])).sort();
  }, [pinnedVisualizations, dataSelections, dataFiltersStore, dataPackageStore]);

  // Build a count spec per entity (with named filters + rollup)
  const countSpecs = useMemo(() => {
    if (!dataPackage) return {};
    const dashState = {
      getNamedFilters: (ids: string[], source: string) => {
        const uuidToSource = new Map<string, string>();
        for (const v of pinnedVisualizations.values()) {
          const src = v.interactiveSpec.source as { name?: string } | Array<{ name?: string }>;
          const sn = Array.isArray(src) ? src[0]?.name : src?.name;
          if (v.uuid && sn) uuidToSource.set(v.uuid, sn);
        }
        const dpState = dataPackageStore.getState();
        const dfState = dataFiltersStore.getState();
        const valid = dfState.getValidDataSelections({
          isValidIntervalFilter: dpState.isValidIntervalFilter,
          isValidPointFilter: dpState.isValidPointFilter,
        });
        const getSource = (id: string) => uuidToSource.get(id) ?? valid[id]?.dataSourceKey ?? null;

        return ids
          .map((id): object | null => {
            const origin = getSource(id);
            if (!origin) return null;
            if (origin !== source) {
              const er = dpState.getEntityRelationship(origin, source);
              if (!er) return null;
              return { filter: { name: id, source: origin, entityRelationship: er } };
            }
            return { filter: { name: id } };
          })
          .filter((f): f is object => f !== null);
      },
    };

    const specs: Record<string, QueryDataSpec> = {};
    for (const chip of chips) {
      const resource = dataPackage.resources.find((r) => r.name === chip.id);
      if (!resource) continue;
      const namedFilters = dashState.getNamedFilters(filterIds, chip.id);
      specs[chip.id] = {
        source: {
          name: chip.id,
          source: joinDataPath(dataPackage['udi:path'], resource.path),
        },
        transformation: [...namedFilters, { rollup: { count: { op: 'count' } } }],
      };
    }
    return specs;
  }, [chips, filterIds, dataPackage, pinnedVisualizations, dataFiltersStore, dataPackageStore]);

  // Build a filtered-data spec per entity (same filters, no rollup) for download export
  const exportSpecs = useMemo(() => {
    if (!dataPackage) return {};
    const specs: Record<string, QueryDataSpec> = {};
    for (const chip of chips) {
      const resource = dataPackage.resources.find((r) => r.name === chip.id);
      if (!resource) continue;
      const countSpec = countSpecs[chip.id];
      if (!countSpec) continue;
      const transformation = (countSpec.transformation as object[]).filter(
        (t) => !('rollup' in (t as object)),
      );
      specs[chip.id] = {
        source: countSpec.source,
        transformation,
      };
    }
    return specs;
  }, [chips, countSpecs, dataPackage]);

  // Merge brush selections and LLM FilterData for queryData count queries
  const mergedSelections = useMemo(
    () => ({ ...vizSelections, ...dataSelections }),
    [vizSelections, dataSelections],
  );

  const domainsReady = loadingPhase === 'ready';

  // Query filtered counts via queryData (replaces hidden EntityCounter UDIVis instances)
  useEffect(() => {
    if (!domainsReady) return;
    let cancelled = false;

    async function runCountQueries() {
      for (const [entityName, spec] of Object.entries(countSpecs)) {
        if (cancelled) return;
        try {
          const result = await queryData(spec, mergedSelections);
          if (cancelled) return;
          const rows = result?.displayData;
          if (
            rows &&
            rows.length > 0 &&
            typeof (rows[0] as Record<string, unknown>).count === 'number'
          ) {
            const count = (rows[0] as Record<string, unknown>).count as number;
            setFilteredCounts((prev) => {
              if (prev[entityName] === count) return prev;
              return { ...prev, [entityName]: count };
            });
          }
        } catch (e) {
          console.error(`Failed to query count for ${entityName}:`, e);
        }
      }
    }

    runCountQueries();
    return () => {
      cancelled = true;
    };
  }, [domainsReady, countSpecs, mergedSelections]);

  // Query filtered export data via queryData (replaces hidden EntityDataExporter UDIVis instances)
  useEffect(() => {
    if (!domainsReady) return;
    let cancelled = false;

    async function runExportQueries() {
      for (const [entityName, spec] of Object.entries(exportSpecs)) {
        if (cancelled) return;
        try {
          const result = await queryData(spec, mergedSelections);
          if (cancelled) return;
          if (result) {
            dataPackageStore.getState().setFilteredData(entityName, {
              displayRows: result.displayData as Record<string, unknown>[],
              allRows: result.allData as Record<string, unknown>[],
            });
          }
        } catch (e) {
          console.error(`Failed to query export data for ${entityName}:`, e);
        }
      }
    }

    runExportQueries();
    return () => {
      cancelled = true;
    };
  }, [domainsReady, exportSpecs, mergedSelections, dataPackageStore]);

  // Skeleton placeholders while fetching the data package manifest
  if (loadingPhase === 'fetching' || loadingPhase === 'idle') {
    if (loadingPhase === 'idle') return null;
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2.5 py-1.5 animate-pulse"
          >
            <div className="h-5 w-5 rounded bg-muted-foreground/20" />
            <div className="flex flex-col items-center gap-1">
              <div className="h-4 w-8 rounded bg-muted-foreground/20" />
              <div className="h-3 w-12 rounded bg-muted-foreground/20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (chips.length === 0) return null;

  const hasFilters = filterIds.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => {
        const filtered = filteredCounts[chip.id];
        const isFiltered =
          domainsReady && hasFilters && filtered != null && filtered !== chip.totalCount;
        return (
          <div
            key={chip.id}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5"
            title={chip.label}
          >
            <chip.Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex flex-col items-center text-center leading-tight">
              <div className="text-base font-bold">
                {isFiltered ? (
                  <>
                    {filtered.toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}
                      / {chip.totalCount.toLocaleString()}
                    </span>
                  </>
                ) : (
                  chip.totalCount.toLocaleString()
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{chip.label}</span>
            </div>
          </div>
        );
      })}
      {!domainsReady && (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading fields...</span>
        </div>
      )}
    </div>
  );
}
