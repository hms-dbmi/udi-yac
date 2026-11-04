import { useEffect, useMemo, useState } from 'react';
import { queryData, type QueryDataSpec } from 'udi-toolkit/react';
import type { DataTransformation } from 'udi-toolkit';
import {
  useDashboard,
  useDashboardStore,
  useDataFilters,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import { joinDataPath } from '@/features/data-package';
import { withLinkedSelections } from '../utils/linkedSelections';
import { otherFilterIds, presentCubeValuesSpec, presentValuesSpec } from '../utils/presentValues';

/** Field → the values present under the other filters (as strings). */
export type PresentValues = Record<string, Set<string>>;

/** A cube's answer names the measure that marks a value present. */
interface PresentQuery {
  field: string;
  spec: QueryDataSpec;
  measure: string | null;
}

/**
 * The values of each of `fields` that occur in the rows the other filters
 * leave (see `presentValues.ts`). A field is absent from the result while no
 * other filter reaches it, before its first answer, or when its query failed:
 * the caller then shows the whole domain. Until a new answer arrives the
 * previous one stands, so a list doesn't flash back to the full domain while
 * a brush is dragged.
 */
export function usePresentFieldValues(
  entity: string,
  fields: string[],
  filterKey: string,
): PresentValues {
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const filterScopes = useDataFilters((s) => s.filterScopes);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const [answers, setAnswers] = useState<PresentValues>({});
  const fieldsKey = JSON.stringify(fields);

  // One query per field; a field nothing narrows has none.
  const queries = useMemo(() => {
    if (loadingPhase !== 'ready' || !entity) return [];
    const dpState = dataPackageStore.getState();
    const dashboard = dashboardStore.getState();
    const resource = dpState.dataPackage?.resources.find((r) => r.name === entity);
    if (!dpState.dataPackage || !resource) return [];
    const source = {
      name: entity,
      source: joinDataPath(dpState.dataPackage['udi:path'], resource.path),
    };
    const fieldList = JSON.parse(fieldsKey) as string[];
    const ids = otherFilterIds(
      dashboard.getFilterIds(dataFiltersStore, dataPackageStore),
      dataFiltersStore.getState().dataSelections,
      filterKey,
      entity,
      fieldList,
    );
    const cube = dpState.getCubeInfo(entity);
    return fieldList.flatMap((field): PresentQuery[] => {
      if (cube) {
        const built = presentCubeValuesSpec(
          source,
          field,
          cube,
          dashboard.getActiveFilters(ids, dataFiltersStore, dataPackageStore),
          (measure) => dpState.getCubeMeasureOp(entity, measure),
        );
        return built ? [{ field, ...built }] : [];
      }
      const named = dashboard.getNamedFilters(
        ids,
        entity,
        dataFiltersStore,
        dataPackageStore,
      ) as DataTransformation[];
      const spec = presentValuesSpec(source, field, named);
      return spec ? [{ field, spec, measure: null }] : [];
    });
    // dataSelections / filterScopes / activeVisualizations are change
    // triggers: the filter builders read them out of the stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loadingPhase,
    entity,
    fieldsKey,
    filterKey,
    dataSelections,
    filterScopes,
    activeVisualizations,
    dashboardStore,
    dataFiltersStore,
    dataPackageStore,
  ]);

  useEffect(() => {
    if (queries.length === 0) return;
    let stale = false;
    const dfState = dataFiltersStore.getState();
    const selections = withLinkedSelections(
      dfState.dataSelections,
      dataPackageStore.getState().dimensionLinks,
      dfState.filterScopes,
    );
    // Debounced like the cohort query, so a brush drag runs one query.
    const timer = setTimeout(() => {
      for (const { field, spec, measure } of queries) {
        queryData(spec, selections, { displayDataOnly: true })
          .then((result) => {
            if (stale) return;
            const rows = result?.displayData as Record<string, unknown>[] | undefined;
            if (!rows) throw new Error('no result');
            const values = new Set(
              rows
                .filter((row) => row[field] != null && (!measure || Number(row[measure]) > 0))
                .map((row) => String(row[field])),
            );
            setAnswers((prev) => ({ ...prev, [field]: values }));
          })
          .catch((err) => {
            if (stale) return;
            console.error(`Filter values: narrowing ${entity}.${field} failed`, err);
            setAnswers((prev) =>
              Object.fromEntries(Object.entries(prev).filter(([f]) => f !== field)),
            );
          });
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [queries, entity, dataFiltersStore, dataPackageStore]);

  // An answer counts only while its field still has a query: once nothing
  // narrows a field, it goes back to the whole domain at once.
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(answers).filter(([f]) => queries.some((q) => q.field === f)),
      ),
    [answers, queries],
  );
}
