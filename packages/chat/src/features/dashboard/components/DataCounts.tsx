import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQueryData, type QueryDataSpec } from 'udi-toolkit/react';
import type { DataTransformation } from 'udi-toolkit';
import {
  useDataPackage,
  useDashboard,
  useDataFilters,
  useDataFiltersStore,
  useDataPackageStore,
  useEntityIcons,
  useGlobalStore,
} from '@/app/UDIChatContext';
import { joinDataPath } from '@/features/data-package';
import { DEFAULT_ENTITY_ICONS, FALLBACK_ENTITY_ICON } from '@/utils/entityIcons';
import type { EntityIconMap } from '../types';

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
  const loadError = useDataPackage((s) => s.error);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const globalStore = useGlobalStore();

  const [filteredCounts, setFilteredCounts] = useState<Record<string, number>>({});

  const consumerIcons = useEntityIcons();
  const mergedIcons = useMemo<EntityIconMap>(
    () => ({ ...DEFAULT_ENTITY_ICONS, ...consumerIcons }),
    [consumerIcons],
  );

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
          Icon: mergedIcons[name] ?? FALLBACK_ENTITY_ICON,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [dataPackage, entityNames, mergedIcons]);

  // Build filter IDs (same logic as dashboardStore.getFilterIds)
  const filterIds = useMemo(() => {
    const vizIds = Array.from(activeVisualizations.values()).map((v) => v.uuid);
    const dpState = dataPackageStore.getState();
    const validSelections = dataFiltersStore.getState().getValidDataSelections({
      isValidIntervalFilter: dpState.isValidIntervalFilter,
      isValidPointFilter: dpState.isValidPointFilter,
    });
    const externalIds = Object.keys(validSelections);
    return Array.from(new Set([...vizIds, ...externalIds])).sort();
  }, [activeVisualizations, dataSelections, dataFiltersStore, dataPackageStore]);

  // Build a count spec per entity (with named filters + rollup)
  const countSpecs = useMemo(() => {
    if (!dataPackage) return {};
    const dashState = {
      getNamedFilters: (ids: string[], source: string) => {
        const uuidToSource = new Map<string, string>();
        for (const v of activeVisualizations.values()) {
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
          .map((id): DataTransformation | null => {
            const origin = getSource(id);
            if (!origin) return null;
            if (origin !== source) {
              const er = dpState.getEntityRelationship(origin, source);
              if (!er) return null;
              return { filter: { name: id, source: origin, entityRelationship: er } };
            }
            return { filter: { name: id, source } };
          })
          .filter((f): f is DataTransformation => f !== null);
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
  }, [chips, filterIds, dataPackage, activeVisualizations, dataFiltersStore, dataPackageStore]);

  // Build a filtered-data spec per entity (same filters, no rollup) for download export
  const exportSpecs = useMemo(() => {
    if (!dataPackage) return {};
    const specs: Record<string, QueryDataSpec> = {};
    for (const chip of chips) {
      const resource = dataPackage.resources.find((r) => r.name === chip.id);
      if (!resource) continue;
      const countSpec = countSpecs[chip.id];
      if (!countSpec) continue;
      const transformation = ((countSpec.transformation ?? []) as DataTransformation[]).filter(
        (t) => !('rollup' in t),
      );
      specs[chip.id] = {
        source: countSpec.source,
        transformation,
      };
    }
    return specs;
  }, [chips, countSpecs, dataPackage]);

  const domainsReady = loadingPhase === 'ready';

  // Brushes live in the shared Pinia DataSourcesStore already — UDIVis's
  // signal listeners write them directly. We only forward LLM-originated
  // dataSelections through queryData; brush state is read from Pinia.
  // useQueryData (multi-spec + onResult mode) owns the self-rescheduling
  // pump, the subscribeToSelections wiring, and sequential queueing
  // across the spec map. Supplying `onResult` routes per-entity results
  // straight into the dashboard's stores without re-rendering DataCounts.
  useQueryData(countSpecs, {
    selections: dataSelections,
    enabled: domainsReady,
    // displayDataOnly auto-defaults to true (count specs end with rollup).
    onResult: (entityName, result) => {
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
    },
  });

  useQueryData(exportSpecs, {
    selections: dataSelections,
    enabled: domainsReady,
    // Export specs have no rollup, so opt in explicitly — we only read
    // displayData; the unfiltered allData pass would be wasted work.
    displayDataOnly: true,
    onResult: (entityName, result) => {
      if (result) {
        dataPackageStore.getState().setFilteredData(entityName, {
          displayRows: result.displayData as Record<string, unknown>[],
        });
      }
    },
  });

  // Surface DataPackage load failures instead of silently rendering nothing.
  if (loadingPhase === 'error') {
    return (
      <div
        className="udi:inline-flex udi:items-center udi:gap-1.5 udi:rounded-md udi:border udi:border-destructive/40 udi:bg-destructive/5 udi:px-2.5 udi:py-1.5 udi:text-xs udi:text-destructive"
        title={loadError ?? undefined}
      >
        <AlertCircle className="udi:h-4 udi:w-4 udi:shrink-0" />
        <span>Couldn't load data package{loadError ? `: ${loadError}` : '.'}</span>
      </div>
    );
  }

  // Skeleton placeholders while fetching the data package manifest
  if (loadingPhase === 'fetching' || loadingPhase === 'idle') {
    if (loadingPhase === 'idle') return null;
    return (
      <div className="udi:flex udi:items-center udi:gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="udi:inline-flex udi:items-center udi:gap-1.5 udi:rounded-md udi:border udi:bg-muted udi:px-2.5 udi:py-1.5 udi:animate-pulse"
          >
            <div className="udi:h-5 udi:w-5 udi:rounded udi:bg-muted-foreground/20" />
            <div className="udi:flex udi:flex-col udi:items-center udi:gap-1">
              <div className="udi:h-4 udi:w-8 udi:rounded udi:bg-muted-foreground/20" />
              <div className="udi:h-3 udi:w-12 udi:rounded udi:bg-muted-foreground/20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (chips.length === 0) return null;

  const hasFilters = filterIds.length > 0;

  return (
    <div className="udi:flex udi:items-center udi:gap-2 udi:flex-wrap">
      {chips.map((chip) => {
        const filtered = filteredCounts[chip.id];
        const isFiltered =
          domainsReady && hasFilters && filtered != null && filtered !== chip.totalCount;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => globalStore.getState().setOverview(true, chip.id)}
            title={`${chip.label} — open data overview`}
            aria-label={`${chip.label}: ${chip.totalCount.toLocaleString()} rows. Open data overview.`}
            className="udi:inline-flex udi:cursor-pointer udi:items-center udi:gap-1.5 udi:rounded-md udi:border udi:bg-background udi:px-2.5 udi:py-1.5 udi:hover:bg-accent udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:focus-visible:outline-none"
          >
            <chip.Icon className="udi:h-5 udi:w-5 udi:text-muted-foreground udi:shrink-0" />
            <div className="udi:flex udi:flex-col udi:items-center udi:text-center udi:leading-tight">
              <div className="udi:text-base udi:font-bold">
                {isFiltered ? (
                  <>
                    {filtered.toLocaleString()}
                    <span className="udi:text-xs udi:font-normal udi:text-muted-foreground">
                      {' '}
                      / {chip.totalCount.toLocaleString()}
                    </span>
                  </>
                ) : (
                  chip.totalCount.toLocaleString()
                )}
              </div>
              <span className="udi:text-[11px] udi:text-muted-foreground">{chip.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
