import { useMemo, useCallback, useState } from 'react';
import { Users, FlaskConical, Table2 } from 'lucide-react';
import { UDIVis } from 'udi-toolkit/react';
import { useDataPackage, useDashboard, useDataFilters, useDataFiltersStore, useDataPackageStore } from '@/stores/UDIChatContext';

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

/** Hidden UDIVis that pushes filtered rows into the dataPackage store for download. */
function EntityDataExporter({
  entityName,
  spec,
  selections,
  onData,
}: {
  entityName: string;
  spec: object;
  selections: object;
  onData: (entity: string, displayRows: object[], allRows: object[]) => void;
}) {
  const handleDataReady = useCallback(
    (payload: { data: object[] | null; allData: object[] | null }) => {
      onData(
        entityName,
        Array.isArray(payload.data) ? payload.data : [],
        Array.isArray(payload.allData) ? payload.allData : [],
      );
    },
    [entityName, onData],
  );

  return (
    <div style={{ display: 'none' }}>
      <UDIVis spec={spec as any} selections={selections as any} onDataReady={handleDataReady} />
    </div>
  );
}

/** Hidden UDIVis that computes a filtered row count for one entity. */
function EntityCounter({
  entityName,
  spec,
  selections,
  onCount,
}: {
  entityName: string;
  spec: object;
  selections: object;
  onCount: (entity: string, count: number) => void;
}) {
  const handleDataReady = useCallback(
    (payload: { data: object[] | null; allData: object[] | null }) => {
      const rows = payload.data;
      if (rows && rows.length > 0 && typeof (rows[0] as any).count === 'number') {
        onCount(entityName, (rows[0] as any).count);
      }
    },
    [entityName, onCount],
  );

  return (
    <div style={{ display: 'none' }}>
      <UDIVis spec={spec as any} selections={selections as any} onDataReady={handleDataReady} />
    </div>
  );
}

export function DataCounts() {
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const entityNames = useDataPackage((s) => s.entityNames);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();

  const [filteredCounts, setFilteredCounts] = useState<Record<string, number>>({});

  const handleCount = useCallback((entity: string, count: number) => {
    setFilteredCounts((prev) => {
      if (prev[entity] === count) return prev;
      return { ...prev, [entity]: count };
    });
  }, []);

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
        // Inline the getNamedFilters logic since we need it outside the store action
        const uuidToSource = new Map<string, string>();
        for (const v of pinnedVisualizations.values()) {
          const sn = Array.isArray(v.interactiveSpec.source)
            ? (v.interactiveSpec.source as any)[0]?.name
            : (v.interactiveSpec.source as any)?.name;
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

    const specs: Record<string, object> = {};
    for (const chip of chips) {
      const resource = dataPackage.resources.find((r) => r.name === chip.id);
      if (!resource) continue;
      const namedFilters = dashState.getNamedFilters(filterIds, chip.id);
      specs[chip.id] = {
        config: { debounce: 500 },
        source: {
          name: chip.id,
          source: `${dataPackage['udi:path']}${resource.path}`,
        },
        transformation: [
          ...namedFilters,
          { rollup: { count: { op: 'count' } } },
        ],
      };
    }
    return specs;
  }, [chips, filterIds, dataPackage, pinnedVisualizations, dataFiltersStore, dataPackageStore]);

  // Build a filtered-data spec per entity (same filters, no rollup) for download export
  const exportSpecs = useMemo(() => {
    if (!dataPackage) return {};
    const specs: Record<string, object> = {};
    for (const chip of chips) {
      const resource = dataPackage.resources.find((r) => r.name === chip.id);
      if (!resource) continue;
      // Reuse the count spec's transformation but strip the rollup
      const countSpec = countSpecs[chip.id] as any;
      if (!countSpec) continue;
      const transformation = (countSpec.transformation as object[]).filter(
        (t: any) => !('rollup' in t),
      );
      specs[chip.id] = {
        config: { debounce: 2000 },
        source: countSpec.source,
        transformation,
      };
    }
    return specs;
  }, [chips, countSpecs, dataPackage]);

  const handleExportData = useCallback(
    (entity: string, displayRows: object[], allRows: object[]) => {
      dataPackageStore.getState().setFilteredData(entity, {
        displayRows: displayRows as Record<string, unknown>[],
        allRows: allRows as Record<string, unknown>[],
      });
    },
    [dataPackageStore],
  );

  // Merge selections for the hidden UDIVis instances
  const mergedSelections = useMemo(
    () => ({ ...dataSelections }),
    [dataSelections],
  );

  if (chips.length === 0) return null;

  const hasFilters = filterIds.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => {
        const filtered = filteredCounts[chip.id];
        const isFiltered = hasFilters && filtered != null && filtered !== chip.totalCount;
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
                      {' '}/ {chip.totalCount.toLocaleString()}
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
      {/* Hidden UDIVis instances to compute filtered counts */}
      {chips.map((chip) =>
        countSpecs[chip.id] ? (
          <EntityCounter
            key={`count-${chip.id}`}
            entityName={chip.id}
            spec={countSpecs[chip.id]}
            selections={mergedSelections}
            onCount={handleCount}
          />
        ) : null,
      )}
      {/* Hidden UDIVis instances to export filtered rows for download */}
      {chips.map((chip) =>
        exportSpecs[chip.id] ? (
          <EntityDataExporter
            key={`export-${chip.id}`}
            entityName={chip.id}
            spec={exportSpecs[chip.id]}
            selections={mergedSelections}
            onData={handleExportData}
          />
        ) : null,
      )}
    </div>
  );
}
