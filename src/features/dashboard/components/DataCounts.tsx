import { useMemo, useState, useEffect, useRef } from 'react';
import { Users, FlaskConical, Table2, Loader2, AlertCircle } from 'lucide-react';
import { queryData } from 'udi-toolkit/react';
import type { QueryDataSpec } from 'udi-toolkit/react';
import {
  useDataPackage,
  useDashboard,
  useDataFilters,
  useDataFiltersStore,
  useDataPackageStore,
  useEntityIcons,
  useSelections,
} from '@/app/UDIChatContext';
import { joinDataPath } from '@/features/data-package';
import type { EntityIconMap } from '../types';

const DEFAULT_ENTITY_ICONS: EntityIconMap = {
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
  const loadError = useDataPackage((s) => s.error);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const vizSelections = useSelections((s) => s.selections);
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();

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
          Icon: mergedIcons[name] ?? Table2,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [dataPackage, entityNames, mergedIcons]);

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

  const domainsReady = loadingPhase === 'ready';

  // Brushes live in the shared Pinia DataSourcesStore already — UDIVis's
  // signal listeners write them directly. Routing them back through
  // queryData's `selections` param would call bindExternalDataSelections
  // with a React-snapshot of vizSelections that races with ongoing brush
  // writes (stale snapshot overwrites fresh Pinia state). So only pass
  // LLM-originated dataSelections (which live in dataFiltersStore, not
  // Pinia). vizSelections stays in the dep list so the effects still
  // re-run on brush changes — they just don't re-bind the brush state.

  // rAF-throttled query dispatch. Live brushing can fire vizSelections
  // updates ~60× per second; without coalescing, every tick would kick
  // off a round of queryData → getDataObject calls per entity, pegging
  // the main thread and visibly flickering charts on the first drag.
  // One query per frame is indistinguishable from "live" to the user.
  const countsRafRef = useRef<number | null>(null);
  const exportsRafRef = useRef<number | null>(null);
  const countsCancelRef = useRef<{ cancelled: boolean } | null>(null);
  const exportsCancelRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    if (!domainsReady) return;

    if (countsRafRef.current !== null) cancelAnimationFrame(countsRafRef.current);
    if (countsCancelRef.current) countsCancelRef.current.cancelled = true;
    const token = { cancelled: false };
    countsCancelRef.current = token;

    countsRafRef.current = requestAnimationFrame(() => {
      countsRafRef.current = null;
      (async () => {
        for (const [entityName, spec] of Object.entries(countSpecs)) {
          if (token.cancelled) return;
          try {
            const result = await queryData(spec, dataSelections);
            if (token.cancelled) return;
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
      })();
    });

    return () => {
      token.cancelled = true;
      if (countsRafRef.current !== null) {
        cancelAnimationFrame(countsRafRef.current);
        countsRafRef.current = null;
      }
    };
  }, [domainsReady, countSpecs, vizSelections, dataSelections]);

  useEffect(() => {
    if (!domainsReady) return;

    if (exportsRafRef.current !== null) cancelAnimationFrame(exportsRafRef.current);
    if (exportsCancelRef.current) exportsCancelRef.current.cancelled = true;
    const token = { cancelled: false };
    exportsCancelRef.current = token;

    exportsRafRef.current = requestAnimationFrame(() => {
      exportsRafRef.current = null;
      (async () => {
        for (const [entityName, spec] of Object.entries(exportSpecs)) {
          if (token.cancelled) return;
          try {
            const result = await queryData(spec, dataSelections);
            if (token.cancelled) return;
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
      })();
    });

    return () => {
      token.cancelled = true;
      if (exportsRafRef.current !== null) {
        cancelAnimationFrame(exportsRafRef.current);
        exportsRafRef.current = null;
      }
    };
  }, [domainsReady, exportSpecs, vizSelections, dataSelections, dataPackageStore]);

  // Surface DataPackage load failures instead of silently rendering nothing.
  if (loadingPhase === 'error') {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
        title={loadError ?? undefined}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Couldn't load data package{loadError ? `: ${loadError}` : '.'}</span>
      </div>
    );
  }

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
