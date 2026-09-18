import { useCallback, useEffect, useMemo, useState } from 'react';
import { UDIVis, usePalette } from 'udi-toolkit/react';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { DataTransformation } from 'udi-toolkit';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Columns3,
  ExternalLink,
  Info,
  KeyRound,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FieldTooltipContent } from '@/components/FieldTooltipContent';
import {
  useDashboard,
  useDashboardStore,
  useDataFilters,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
  useGlobalStore,
  useTracker,
} from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import type { DataFieldDomain } from '@/types/dataPackage';
import { highlightMatch } from '@/utils/highlightMatch';
import { joinDataPath } from '../utils/joinDataPath';
import {
  categoricalValues,
  describeRelationships,
  formatIntervalDomain,
  relationshipKeyFields,
} from '../utils/entityOverview';

interface FieldRow {
  name: string;
  description?: string;
  /** `udi:data_type`, shown as a badge in the hover card. */
  dataType?: string;
  isKey: boolean;
  /** Numeric range, or the distinct-count fallback when no domain was derived. */
  summary?: string;
  /** Distinct values, for categorical fields. */
  values?: string[];
}

interface EntityOverviewProps {
  entity: string;
}

/**
 * ponytail: cap the expanded value list. An id-like column has one distinct
 * value per row (9474 for HuBMAP `datasets`), and the domain worker caps
 * nothing. Virtualise only if a real package needs more than this on screen.
 */
const EXPANDED_VALUE_CAP = 200;

/**
 * Reserves the width of a disclosure chevron (`size-3` + `gap-1` = 1rem) in the
 * values column. Rows that have no chevron — ranges, a lone value, "no values" —
 * and the column header all carry it, so every label shares one left edge and
 * only the chevrons sit in the gutter. Keep it on all four or they drift apart.
 */
const VALUE_COLUMN_INDENT = 'pl-4';

/**
 * Stands in for a message index on cards popped out of the overview. Cards
 * derived from chat messages key on a real (non-negative) message index, so a
 * negative one cannot collide with them.
 */
const POPPED_VIZ_INDEX = -1;

/**
 * Column header, so both sides of the field table are labelled.
 *
 * Sticks directly beneath the Fields bar (`top-9` + its `h-9`), so it stays
 * clear which group the visible rows belong to. Each group wraps its own header
 * — a sticky element is bound by its containing block, so a shared parent would
 * leave the Quantitative header pinned over the Nominal rows.
 */
function FieldListHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-18 z-5 flex items-baseline gap-2 border-b bg-background pb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      <span className="shrink-0 basis-[45%]">{label}</span>
      <span className={cn('min-w-0 flex-1', VALUE_COLUMN_INDENT)}>Possible values</span>
    </div>
  );
}

function CategoricalValues({ values, query }: { values: string[]; query: string }) {
  const [open, setOpen] = useState(false);

  // When the query matched this field's values rather than its name, the label
  // narrows to "N of M values" and expanding shows just the matches — otherwise
  // a hit on one of 9474 values would be impossible to find.
  const matching = useMemo(
    () => (query ? values.filter((v) => v.toLowerCase().includes(query)) : values),
    [values, query],
  );
  const isFiltered = query.length > 0 && matching.length > 0 && matching.length < values.length;
  const shown = isFiltered ? matching : values;

  // A lone value is the value; anything more is counted and put behind a
  // disclosure. (`<= 1` rather than `=== 1` only so an empty list, which the
  // caller already turns into a "no values" summary, cannot render "0 values".)
  if (values.length <= 1) {
    return (
      <span
        className={cn('min-w-0 flex-1 truncate text-muted-foreground', VALUE_COLUMN_INDENT)}
        title={values.join(', ')}
      >
        {highlightMatch(values.join(', '), query)}
      </span>
    );
  }
  // Native <details> for the disclosure itself — free keyboard and a11y
  // semantics, no widget to mount per field. The contents are still gated on
  // React state rather than left to the UA stylesheet: <details> keeps closed
  // children in the DOM, and a wide entity of high-cardinality columns would put
  // tens of thousands of hidden nodes on the page for nobody to read.
  return (
    <details className="group min-w-0 flex-1" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
        <span className="tabular-nums">
          {isFiltered
            ? `${matching.length.toLocaleString()} of ${values.length.toLocaleString()} values`
            : `${values.length.toLocaleString()} values`}
        </span>
      </summary>
      {open && (
        <>
          <ul className="mt-1 mb-1.5 flex flex-wrap gap-1">
            {shown.slice(0, EXPANDED_VALUE_CAP).map((value) => (
              // min-w-0 lets the flex item shrink below its content width, and
              // the badge overrides its own base h-5/shrink-0/whitespace-nowrap
              // so a long value wraps inside the chip instead of overflowing the
              // panel. wrap-anywhere breaks unbroken ids but still prefers real
              // break opportunities in multi-word values.
              <li key={value} className="min-w-0">
                <Badge
                  variant="secondary"
                  className="h-auto max-w-full shrink wrap-anywhere whitespace-normal font-mono text-[10px]"
                >
                  {highlightMatch(value, query)}
                </Badge>
              </li>
            ))}
          </ul>
          {shown.length > EXPANDED_VALUE_CAP && (
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              Showing the first {EXPANDED_VALUE_CAP.toLocaleString()} of{' '}
              {shown.length.toLocaleString()}.
            </p>
          )}
        </>
      )}
    </details>
  );
}

function FieldNameCell({ row, query, label }: { row: FieldRow; query: string; label?: string }) {
  const name = (
    <span className="flex min-w-0 items-center gap-1 font-mono">
      <span className="truncate">{highlightMatch(row.name, query)}</span>
      {row.description && (
        <Info className="size-3 shrink-0 text-muted-foreground opacity-60" aria-hidden />
      )}
    </span>
  );
  // Undescribed fields with no data type have nothing to show on hover, so they
  // skip the Tooltip entirely — which is also what keeps the per-row cost of a
  // 258-field entity down.
  const hasLabel = !!label && label !== row.name;
  if (!row.description && !row.dataType && !hasLabel) return name;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex min-w-0 cursor-help" />}>{name}</TooltipTrigger>
      <FieldTooltipContent
        field={row.name}
        label={label}
        dataType={row.dataType}
        description={row.description}
      />
    </Tooltip>
  );
}

function FieldList({ rows, query, entity }: { rows: FieldRow[]; query: string; entity: string }) {
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);
  return (
    // Same provider settings as the chat's field chips, so hover timing matches.
    <TooltipProvider delay={150} timeout={0}>
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
              <FieldNameCell row={row} query={query} label={getFieldLabel(entity, row.name)} />
            </span>
            {row.values ? (
              <CategoricalValues values={row.values} query={query} />
            ) : (
              <span
                className={cn('min-w-0 flex-1 truncate text-muted-foreground', VALUE_COLUMN_INDENT)}
                title={row.summary}
              >
                {row.summary}
              </span>
            )}
          </li>
        ))}
      </ul>
    </TooltipProvider>
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
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const getKeyFields = useDataPackage((s) => s.getKeyFields);
  // Subscribed so the row table's named filters are rebuilt when the set of
  // filters changes (see the tableSpec memo).
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const palette = usePalette();
  const trackEvent = useTracker();

  const [query, setQuery] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);

  // Opt-in, because mounting the table is by far the most expensive thing on
  // this panel: ag-grid builds a RowNode per source row (9474 for HuBMAP
  // `datasets`) plus a Vue render root per visible cell, and TableComponent
  // scans a full column per mapping to derive scale domains. Rendering it
  // eagerly made expanding an entity block the main thread for ~1s — long
  // enough that hovering another accordion item showed no hover state. The
  // metadata above is what most expansions are actually for.
  const [showRows, setShowRows] = useState(false);

  // Once asked for, still mount a frame late so the button's pressed state and
  // the skeleton paint before the grid takes the thread.
  const [tableReady, setTableReady] = useState(false);
  useEffect(() => {
    if (!showRows) return;
    const id = requestAnimationFrame(() => setTableReady(true));
    return () => cancelAnimationFrame(id);
  }, [showRows]);

  const toggleRows = useCallback(() => {
    setShowRows((v) => !v);
    setTableReady(false);
  }, []);

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
  const rowCount = resource?.['udi:row_count'] ?? 0;
  // Two different notions, deliberately: the badge marks fields that really act
  // as keys in a relationship, while the row table's column projection keeps the
  // store's broader definition (which also counts `udi:unique` fields).
  const keyBadgeFields = useMemo(
    () => relationshipKeyFields(dataPackage, entity),
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
    const num: FieldRow[] = [];
    const cat: FieldRow[] = [];
    for (const field of resource?.schema?.fields ?? []) {
      const domain = domainsByField.get(field.name);
      const base = {
        name: field.name,
        description: field.description || domain?.fieldDescription || undefined,
        dataType: field['udi:data_type'],
        isKey: keyBadgeFields.has(field.name),
      };
      if (domain?.type === 'interval') {
        num.push({ ...base, summary: formatIntervalDomain(domain) });
        continue;
      }
      if (domain) {
        const values = categoricalValues(domain);
        cat.push(values.length > 0 ? { ...base, values } : { ...base, summary: 'no values' });
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
  }, [resource, domainsByField, keyBadgeFields]);

  // Matches a field by name or by any of its values, so searching "CODEX" finds
  // `assay_type`. Numeric fields have no value list — a range isn't searchable.
  //
  // ponytail: plain substring scan, no index. `some` short-circuits on a hit, so
  // the cost is a full pass over one entity's distinct values only when nothing
  // matches. Build an index if a package ever makes that visible.
  const needle = query.trim().toLowerCase();
  const match = (rows: FieldRow[]) =>
    needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.values?.some((v) => v.toLowerCase().includes(needle)),
        )
      : rows;
  const shownNumeric = match(numeric);
  const shownCategorical = match(categorical);
  const totalFields = numeric.length + categorical.length;

  /**
   * The table without any filters applied — source plus, optionally, a row
   * layer over the entity's key columns. This is what gets popped to the
   * dashboard: `dashboardStore.updateSpecFilters` prepends the active named
   * filters to `viz.spec.transformation`, so a spec that already carried them
   * would filter twice.
   */
  const baseTableSpec = useMemo<UDIGrammar | null>(() => {
    if (!dataPackage || !resource) return null;
    const spec: UDIGrammar = {
      source: { name: entity, source: joinDataPath(dataPackage['udi:path'], resource.path) },
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
  }, [dataPackage, resource, entity, showAllFields, keyFields, domainsByField]);

  /** The same table with the currently active filters, for the inline preview. */
  const tableSpec = useMemo<UDIGrammar | null>(() => {
    if (!baseTableSpec) return null;
    const dash = dashboardStore.getState();
    const filterIds = dash.getFilterIds(dataFiltersStore);
    const namedFilters = dash.getNamedFilters(
      filterIds,
      entity,
      dataFiltersStore,
      dataPackageStore,
    ) as DataTransformation[];
    return { ...baseTableSpec, transformation: namedFilters };
    // dataSelections / activeVisualizations are change triggers rather than
    // direct inputs: getFilterIds and getNamedFilters read them out of the
    // stores via getState(), which the linter cannot see.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseTableSpec,
    entity,
    dataSelections,
    activeVisualizations,
    dashboardStore,
    dataFiltersStore,
    dataPackageStore,
  ]);

  const popToDashboard = useCallback(() => {
    if (!baseTableSpec || !dataPackage) return;
    // Key space: message-derived cards use `${messageIndex}-${toolCallIndex}`
    // with both non-negative, so POPPED_VIZ_INDEX can never collide. Keying the
    // second slot on the entity's position makes popping the same entity twice
    // a no-op rather than a duplicate card — addActiveVisualizationBatch skips
    // keys it already holds.
    const resourceIndex = dataPackage.resources.findIndex((r) => r.name === entity);
    dashboardStore.getState().addActiveVisualizationBatch(
      [
        {
          index: POPPED_VIZ_INDEX,
          toolCallIndex: resourceIndex,
          spec: baseTableSpec,
          userPrompt: `${entity} rows`,
          sourceFields,
          title: `${entity} rows`,
        },
      ],
      dataPackageStore,
    );
    trackEvent('data_overview_table_popped', { entity, allFields: showAllFields });
  }, [
    baseTableSpec,
    dataPackage,
    entity,
    sourceFields,
    showAllFields,
    dashboardStore,
    dataPackageStore,
    trackEvent,
  ]);

  if (!resource) return null;

  return (
    <div className="flex flex-col gap-3 pb-1">
      {relationships.length > 0 && (
        <section>
          <h4 className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
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
        {/*
         * Sticks below the entity trigger so the field count and the filter stay
         * reachable while scrolling a 258-field entity. The offsets form a
         * chain of fixed heights — trigger h-9 at top-0, this h-9 at top-9,
         * FieldListHeader at top-18. Change one and the rest must follow, so
         * this row keeps a fixed height even when the filter input is absent.
         */}
        <div className="sticky top-9 z-10 mb-1 flex h-9 items-center justify-between gap-2 bg-background">
          <h4 className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Fields ({totalFields})
          </h4>
          {/* Always offered: it now matches values as well as names, so it is
              useful even on an entity with only a handful of fields. */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter fields or values..."
              aria-label={`Filter ${entity} fields or values`}
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>
        </div>
        {/* Each group is its own containing block — see FieldListHeader. */}
        {shownNumeric.length > 0 && (
          <div>
            <FieldListHeader label="Quantitative" />
            <FieldList rows={shownNumeric} query={needle} entity={entity} />
          </div>
        )}
        {shownCategorical.length > 0 && (
          <div className={cn(shownNumeric.length > 0 && 'mt-2')}>
            <FieldListHeader label="Nominal" />
            <FieldList rows={shownCategorical} query={needle} entity={entity} />
          </div>
        )}
        {shownNumeric.length === 0 && shownCategorical.length === 0 && (
          <p className="text-xs text-muted-foreground">No fields match “{query}”.</p>
        )}
      </section>

      {tableSpec && (
        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Rows
            </h4>
            <div className="flex items-center gap-1">
              {showRows && keyFields.length > 0 && (
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={popToDashboard}
                      aria-label={`Open ${entity} rows on the dashboard`}
                    />
                  }
                >
                  <ExternalLink className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  Open on dashboard{showRows && keyFields.length > 0 ? ' (current columns)' : ''}
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                aria-expanded={showRows}
                onClick={toggleRows}
              >
                {showRows ? 'Hide' : `Show ${rowCount.toLocaleString()} rows`}
              </Button>
            </div>
          </div>
          {/* Nothing is mounted until asked for — see the showRows comment.
              fillContainer needs a definite height from the parent. The key
              deliberately excludes the transformation so filter changes update
              the table in place instead of remounting the custom element. */}
          {showRows && (
            <div className="h-64">
              {tableReady ? (
                <UDIVis
                  key={`${entity}|${showAllFields}`}
                  className="block h-full w-full"
                  spec={tableSpec}
                  selections={dataSelections}
                  sourceResolver={sourceResolver}
                  palette={palette}
                  fillContainer
                />
              ) : (
                <div className="h-full animate-pulse rounded bg-muted" />
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
