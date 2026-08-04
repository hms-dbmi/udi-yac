import { useCallback, useMemo, useState } from 'react';
import { UDIVis, usePalette } from 'udi-toolkit/react';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { DataTransformation } from 'udi-toolkit';
import { ArrowLeft, ArrowRight, Columns3, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useDashboard,
  useDashboardStore,
  useDataFilters,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
  useGlobalStore,
} from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import type { DataFieldDomain } from '@/types/dataPackage';
import { joinDataPath } from '../utils/joinDataPath';
import { describeRelationships, formatFieldDomain } from '../utils/entityOverview';

interface FieldRow {
  name: string;
  summary: string;
  description?: string;
  isKey: boolean;
}

interface EntityOverviewProps {
  entity: string;
}

function FieldList({ rows }: { rows: FieldRow[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.name} className="flex items-baseline gap-2 py-0.5 text-xs">
          <span className="flex min-w-0 shrink-0 basis-[45%] items-baseline gap-1">
            {row.isKey && (
              <KeyRound
                className="size-3 shrink-0 self-center text-muted-foreground"
                aria-label="key field"
              />
            )}
            {row.description ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="truncate font-medium underline decoration-dotted decoration-muted-foreground/50 underline-offset-2" />
                  }
                >
                  {row.name}
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{row.description}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="truncate font-medium">{row.name}</span>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.summary}>
            {row.summary}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Body of one entity's accordion item: its foreign-key relationships, every
 * field with its range or leading categories, and a table of the rows that
 * survive the currently active filters.
 */
export function EntityOverview({ entity }: EntityOverviewProps) {
  const globalStore = useGlobalStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const dataFieldDomains = useDataPackage((s) => s.dataFieldDomains);
  const sourceResolver = useDataPackage((s) => s.sourceResolver);
  const getKeyFields = useDataPackage((s) => s.getKeyFields);
  // Subscribed so the row table's named filters are rebuilt when the set of
  // filters changes (see the tableSpec memo).
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const palette = usePalette();

  const [query, setQuery] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);

  const goToEntity = useCallback(
    (name: string) => globalStore.getState().setOverview(true, name),
    [globalStore],
  );

  const resource = useMemo(
    () => dataPackage?.resources.find((r) => r.name === entity),
    [dataPackage, entity],
  );
  const relationships = useMemo(
    () => describeRelationships(dataPackage, entity),
    [dataPackage, entity],
  );
  const keyFields = useMemo(() => getKeyFields(entity), [getKeyFields, entity]);

  const domainsByField = useMemo(() => {
    const map = new Map<string, DataFieldDomain>();
    for (const domain of dataFieldDomains) {
      if (domain.entity === entity) map.set(domain.field, domain);
    }
    return map;
  }, [dataFieldDomains, entity]);

  const { numeric, categorical } = useMemo(() => {
    const keySet = new Set(keyFields);
    const num: FieldRow[] = [];
    const cat: FieldRow[] = [];
    for (const field of resource?.schema?.fields ?? []) {
      const domain = domainsByField.get(field.name);
      const base = {
        name: field.name,
        description: field.description || domain?.fieldDescription || undefined,
        isKey: keySet.has(field.name),
      };
      if (domain) {
        const row = { ...base, summary: formatFieldDomain(domain) };
        (domain.type === 'interval' ? num : cat).push(row);
        continue;
      }
      // No domain: remote mode omits categoricals above 80 distinct values, and
      // the CSV domain worker can fail for a single entity. Fall back to the
      // manifest's own cardinality so the field is still listed.
      const cardinality = field['udi:cardinality'];
      const row = {
        ...base,
        summary:
          cardinality != null ? `${cardinality.toLocaleString()} distinct values` : 'no summary',
      };
      (field['udi:data_type'] === 'quantitative' ? num : cat).push(row);
    }
    return { numeric: num, categorical: cat };
  }, [resource, domainsByField, keyFields]);

  // ponytail: plain substring filter over an unvirtualised list. Only the
  // expanded entity is mounted, so the worst case is one wide table's fields
  // (258 for HuBMAP `datasets`).
  const needle = query.trim().toLowerCase();
  const match = (rows: FieldRow[]) =>
    needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
  const shownNumeric = match(numeric);
  const shownCategorical = match(categorical);
  const totalFields = numeric.length + categorical.length;

  const tableSpec = useMemo<UDIGrammar | null>(() => {
    if (!dataPackage || !resource) return null;
    const dash = dashboardStore.getState();
    const filterIds = dash.getFilterIds(dataFiltersStore);
    const namedFilters = dash.getNamedFilters(
      filterIds,
      entity,
      dataFiltersStore,
      dataPackageStore,
    ) as DataTransformation[];

    const spec: UDIGrammar = {
      source: { name: entity, source: joinDataPath(dataPackage['udi:path'], resource.path) },
      transformation: namedFilters,
    };
    // Omitting `representation` makes the toolkit's parser default to a row
    // layer over `field: '*'` — every column, no code. Narrow it to the
    // entity's key columns otherwise, mirroring DashboardCard's table view.
    if (!showAllFields && keyFields.length > 0) {
      spec.representation = {
        mark: 'row',
        mapping: keyFields.map((field) => ({
          encoding: 'text' as const,
          mark: 'text' as const,
          field,
          type:
            domainsByField.get(field)?.type === 'interval'
              ? ('quantitative' as const)
              : ('nominal' as const),
        })),
      };
    }
    return spec;
    // dataSelections / activeVisualizations are change triggers rather than
    // direct inputs: getFilterIds and getNamedFilters read them out of the
    // stores via getState(), which the linter cannot see.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataPackage,
    resource,
    entity,
    showAllFields,
    keyFields,
    domainsByField,
    dataSelections,
    activeVisualizations,
    dashboardStore,
    dataFiltersStore,
    dataPackageStore,
  ]);

  if (!resource) return null;

  return (
    <div className="flex flex-col gap-3 pb-1">
      {relationships.length > 0 && (
        <section>
          <h4 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Relationships
          </h4>
          <ul className="flex flex-col gap-0.5">
            {relationships.map((rel, i) => (
              <li
                key={`${rel.direction}-${rel.target}-${i}`}
                className="flex items-baseline gap-1.5 text-xs"
              >
                {rel.direction === 'out' ? (
                  <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground" />
                ) : (
                  <ArrowLeft className="size-3 shrink-0 self-center text-muted-foreground" />
                )}
                <button
                  type="button"
                  className="font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => goToEntity(rel.target)}
                >
                  {rel.target}
                </button>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {rel.fromField} = {rel.toField}
                  {rel.cardinality ? ` · ${rel.cardinality}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Fields ({totalFields})
          </h4>
          {totalFields > 12 && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter fields"
              aria-label={`Filter ${entity} fields`}
              className="h-6 w-32 text-xs"
            />
          )}
        </div>
        {shownNumeric.length > 0 && (
          <>
            <div className="text-[11px] text-muted-foreground">Numeric</div>
            <FieldList rows={shownNumeric} />
          </>
        )}
        {shownCategorical.length > 0 && (
          <>
            <div className="mt-1.5 text-[11px] text-muted-foreground">Categorical</div>
            <FieldList rows={shownCategorical} />
          </>
        )}
        {shownNumeric.length === 0 && shownCategorical.length === 0 && (
          <p className="text-xs text-muted-foreground">No fields match “{query}”.</p>
        )}
      </section>

      {tableSpec && (
        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Rows
            </h4>
            {keyFields.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-pressed={showAllFields}
                      onClick={() => setShowAllFields((v) => !v)}
                    />
                  }
                >
                  <Columns3 className={cn('size-3.5', showAllFields && 'text-udi-primary')} />
                </TooltipTrigger>
                <TooltipContent>
                  {showAllFields ? 'Show key fields only' : 'Show all fields'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {/* fillContainer needs a definite height from the parent. The key
              deliberately excludes the transformation so filter changes update
              the table in place instead of remounting the custom element. */}
          <div className="h-64">
            <UDIVis
              key={`${entity}|${showAllFields}`}
              className="block h-full w-full"
              spec={tableSpec}
              selections={dataSelections}
              sourceResolver={sourceResolver}
              palette={palette}
              fillContainer
            />
          </div>
        </section>
      )}
    </div>
  );
}
