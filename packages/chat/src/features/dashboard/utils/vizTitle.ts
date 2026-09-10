import type { UDIGrammar } from 'udi-toolkit/react';
import { collectRollupOutputs, type RollupOutput } from '@/utils/specMutations';
import { humanizeFieldName, singularizeLabel } from '@/utils/humanize';

/**
 * Chart titles are built from the spec, not written by the LLM: free,
 * deterministic, and incapable of drifting from what is actually plotted.
 * A card's displayed title is therefore just:
 *
 *   userTitle ?? buildVizTitle(spec) ?? title ?? userPrompt
 *
 * `title` is the assistant-written title that older sessions carry; nothing
 * produces one any more, but imported dashboards still display theirs.
 *
 * The built title is deliberately not stored: it is recomputed from `spec` on
 * read, so a field swap in VizTweakComponent needs no store bookkeeping.
 */

interface MappingLike {
  field?: string;
  encoding?: string;
  type?: string;
  /** The grammar's per-encoding axis/legend label; preferred over `field`. */
  title?: string;
  /** The grammar's per-encoding categorical value labels. */
  labels?: Record<string, string>;
}

interface LayerLike {
  mark?: string;
  mapping?: MappingLike | MappingLike[];
}

/**
 * Display labels the builder needs from the data package. Structural rather
 * than a store import so this module stays pure and testable; the dashboard
 * passes `dataPackageStore`'s `getFieldLabel` / `getEntityLabel` straight in.
 * Omitted entirely, every name falls back to `humanizeFieldName`.
 */
export interface VizTitleLabels {
  getFieldLabel?: (entity: string, field: string) => string;
  getEntityLabel?: (entity: string) => string;
  /** `udi:data_type` of a field, used to pick "categorized by" vs "colored by". */
  getFieldDataType?: (entity: string, field: string) => string | undefined;
  /** The package's categorical value labels, raw → label. Used to relabel axis
   *  and legend text; see `applyFieldLabels`. */
  valueLabels?: Record<string, string>;
}

/** Sentence-style labels for aggregation ops, mirroring the toolkit's
 *  `describeTransformations` OP_LABELS but phrased as a noun. */
const OP_LABELS: Record<string, string> = {
  count: 'Count',
  sum: 'Total',
  mean: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  median: 'Median',
  frequency: 'Frequency',
};

/** Chart-type names by mark. Refined below by transformations that change what
 *  the chart *is* (a binned bar chart is a histogram, not a bar chart). */
const MARK_LABELS: Record<string, string> = {
  bar: 'Bar chart',
  point: 'Scatter plot',
  line: 'Line chart',
  area: 'Area chart',
  arc: 'Pie chart',
  rect: 'Heatmap',
  geometry: 'Map',
  text: 'Text chart',
};

/** Encodings that carry a trailing clause instead of joining the field list. */
const CLAUSE_ENCODINGS = ['color', 'size'] as const;

function resolveSourceName(spec: UDIGrammar): string | null {
  const src = Array.isArray(spec.source)
    ? (spec.source as Array<{ name?: string }>)[0]
    : (spec.source as { name?: string } | undefined);
  return src?.name ?? null;
}

function toLayers(representation: unknown): LayerLike[] {
  if (!representation) return [];
  return (Array.isArray(representation) ? representation : [representation]) as LayerLike[];
}

function toMappings(mapping: LayerLike['mapping']): MappingLike[] {
  if (!mapping) return [];
  return Array.isArray(mapping) ? mapping : [mapping];
}

function hasTransform(spec: UDIGrammar, key: string): boolean {
  const transformation = (spec as { transformation?: Array<Record<string, unknown>> })
    .transformation;
  return Array.isArray(transformation) && transformation.some((t) => t && key in t);
}

/** "Bar chart", "Histogram", "Density plot", … from the mark plus the
 *  transformations that redefine what kind of chart it is. */
function chartTypeLabel(
  mark: string | undefined,
  spec: UDIGrammar,
  mappings: MappingLike[],
): string {
  if (mark === 'bar' && hasTransform(spec, 'binby')) return 'Histogram';
  if (mark === 'area' && hasTransform(spec, 'kde')) return 'Density plot';
  if (mark === 'point') {
    // A scatter needs two quantitative axes; a categorical one makes it a strip
    // of dots against categories instead.
    const axes = mappings.filter((m) => m.encoding === 'x' || m.encoding === 'y');
    const allQuantitative =
      axes.length >= 2 && axes.every((m) => !m.type || m.type === 'quantitative');
    return allQuantitative ? 'Scatter plot' : 'Dot plot';
  }
  return (mark && MARK_LABELS[mark]) || 'Chart';
}

/**
 * How this spec's fields are named, in one place, so a card's title and its
 * chart's axis labels can never disagree.
 */
function makeLabeler(spec: UDIGrammar, labels: VizTitleLabels) {
  const sourceName = resolveSourceName(spec);
  const entityLabel = sourceName
    ? (labels.getEntityLabel?.(sourceName) ?? humanizeFieldName(sourceName))
    : null;
  const rollupOutputs = collectRollupOutputs(spec);

  const fieldLabel = (field: string) =>
    sourceName
      ? (labels.getFieldLabel?.(sourceName, field) ?? humanizeFieldName(field))
      : humanizeFieldName(field);

  /**
   * Label one encoding. An explicit `mapping.title` is already prose and wins;
   * a rollup output reads as its aggregation ("Count of Donors", "Average BMI");
   * anything else is the field's friendly label.
   */
  const label = (m: MappingLike): string | null => {
    if (!m.field || m.field === '*') return null;
    if (m.title) return m.title;
    const rollup: RollupOutput | undefined = rollupOutputs[m.field];
    if (!rollup) return fieldLabel(m.field);
    const op = rollup.op ? (OP_LABELS[rollup.op] ?? rollup.op) : null;
    if (!op) return fieldLabel(m.field);
    // count / frequency aggregate rows rather than a column, so they name the
    // entity; the rest name their input field.
    if (!rollup.field) return entityLabel ? `${op} of ${entityLabel}` : op;
    return `${op} ${fieldLabel(rollup.field)}`;
  };

  const isMeasure = (m: MappingLike) => !!m.field && m.field in rollupOutputs;

  return { sourceName, entityLabel, label, isMeasure, fieldLabel, rollupOutputs };
}

/**
 * Resolve a template's tokens against the spec being rendered.
 *
 * The agent picks the wording from the visualization template it used and sends
 * it tokenized rather than filled in, so the text follows the chart: swap the x
 * field in the tweak panel and `{enc:x}` re-resolves on the next render.
 *
 *   {entity} {entity1} {entity2}   the source's display label
 *   {entity:one}                   its singular, for "a point for each Donor"
 *   {enc:x}                        what encoding x plots — "Average Age"
 *   {field:x}                      the column behind it  — "Age"
 *
 * Returns undefined if any token cannot be resolved, so the caller falls back
 * to the generic builder rather than showing a half-filled sentence.
 */
export function renderTextTemplate(
  template: string,
  spec: UDIGrammar,
  labels: VizTitleLabels = {},
): string | undefined {
  if (!template) return undefined;
  const { entityLabel, label, fieldLabel, rollupOutputs } = makeLabeler(spec, labels);

  const sources = (Array.isArray(spec.source) ? spec.source : [spec.source]) as Array<{
    name?: string;
  }>;
  const entityAt = (index: number, singular = false) => {
    const name = sources[index]?.name;
    if (!name) return undefined;
    const label = labels.getEntityLabel?.(name) ?? humanizeFieldName(name);
    // Entity labels name a table and so read as plurals ("Donors"); prose that
    // counts one row at a time needs the singular.
    return singular ? singularizeLabel(label) : label;
  };

  const byEncoding = new Map<string, MappingLike>();
  for (const layer of toLayers(spec.representation)) {
    for (const m of toMappings(layer?.mapping)) {
      if (m?.encoding && !byEncoding.has(m.encoding)) byEncoding.set(m.encoding, m);
    }
  }

  let unresolved = false;
  const rendered = template.replace(/\{([a-zA-Z]+[0-9]*)(?::([^}]+))?\}/g, (whole, kind, arg) => {
    let value: string | undefined;
    const one = arg === 'one';
    if (kind === 'entity')
      value =
        entityAt(0, one) ?? (one ? singularizeLabel(entityLabel ?? '') : entityLabel) ?? undefined;
    else if (kind === 'entity1') value = entityAt(0, one);
    else if (kind === 'entity2') value = entityAt(1, one);
    else if (kind === 'enc' && arg) value = label(byEncoding.get(arg) ?? {}) ?? undefined;
    else if (kind === 'field' && arg) {
      const m = byEncoding.get(arg);
      // The column behind an aggregated encoding, so prose can name it while
      // spelling the operation out itself — "the mean Age", not "the mean
      // Average Age".
      const rollup = m?.field ? rollupOutputs[m.field] : undefined;
      const field = rollup?.field ?? m?.field;
      value = field ? fieldLabel(field) : undefined;
    } else return whole;
    if (!value) unresolved = true;
    return value ?? whole;
  });

  return unresolved ? undefined : rendered;
}

/**
 * A copy of the spec with the package's display labels attached to each
 * encoding, both of which the toolkit passes through to Vega:
 *
 *   `title`   the field's label — axis, legend and tooltip key read "Weight"
 *             rather than "weight_value"
 *   `labels`  the categorical value labels, compiled to Vega's `labelExpr`, so
 *             an axis tick reads "CHOP" while the data keeps the full name
 *
 * Render-time only. The stored spec keeps raw field names and values, because
 * that is what export, the reset-to-original comparison, selections and the
 * query compiler all read.
 */
export function applyFieldLabels(spec: UDIGrammar, labels: VizTitleLabels = {}): UDIGrammar {
  if (!spec?.representation) return spec;
  const { label } = makeLabeler(spec, labels);

  const valueLabels = labels.valueLabels;
  const hasValueLabels = !!valueLabels && Object.keys(valueLabels).length > 0;

  let changed = false;
  const labelMapping = (m: MappingLike): MappingLike => {
    // A row layer's `*` wildcard covers every column, so no single name fits.
    if (!m.field || m.field === '*') return m;
    let next = m;
    // An explicit title from the spec author always wins.
    if (!m.title) {
      const l = label(m);
      if (l && l !== m.field) next = { ...next, title: l };
    }
    // Value labels only make sense on a categorical encoding — a quantitative
    // axis has no discrete ticks to rename.
    if (hasValueLabels && !m.labels && m.type !== 'quantitative') {
      next = { ...next, labels: valueLabels };
    }
    if (next === m) return m;
    changed = true;
    return next;
  };

  const layers = toLayers(spec.representation).map((layer) => {
    if (!layer?.mapping) return layer;
    return {
      ...layer,
      mapping: Array.isArray(layer.mapping)
        ? layer.mapping.map(labelMapping)
        : labelMapping(layer.mapping),
    };
  });
  if (!changed) return spec;

  return {
    ...spec,
    representation: Array.isArray(spec.representation) ? layers : layers[0],
  } as UDIGrammar;
}

export function buildVizTitle(spec: UDIGrammar, labels: VizTitleLabels = {}): string | undefined {
  const { entityLabel, label, isMeasure } = makeLabeler(spec, labels);
  const tableTitle = entityLabel ? `Table of ${entityLabel}` : undefined;

  // No representation at all means the toolkit's parser defaults to a row layer
  // over every column — same as an explicit `mark: 'row'` table.
  const chart = toLayers(spec.representation).find((l) => l && l.mark !== 'row');
  if (!chart) return tableTitle;

  const mappings = toMappings(chart.mapping).filter((m) => m?.field && m.field !== '*');
  if (mappings.length === 0) return tableTitle;
  const isClause = (m: MappingLike) =>
    !!m.encoding && (CLAUSE_ENCODINGS as readonly string[]).includes(m.encoding);

  // `color` / `size` become trailing clauses; everything else is an axis that
  // joins the main field list.
  const axisMappings = mappings.filter((m) => !isClause(m));
  const clauseMappings = CLAUSE_ENCODINGS.map((encoding) =>
    mappings.find((m) => m.encoding === encoding),
  ).filter((m): m is MappingLike => !!m);

  const sourceName = resolveSourceName(spec);
  const chartType = chartTypeLabel(chart.mark, spec, mappings);
  const subject = buildSubject(axisMappings.length > 0 ? axisMappings : mappings, label, isMeasure);
  if (!subject) return tableTitle;

  const clauses = clauseMappings
    .map((m) => {
      const l = label(m);
      if (!l || subject.includes(l)) return null;
      if (m.encoding === 'size') return `sized by ${l}`;
      // A categorical colour really is a grouping; a continuous one is a ramp.
      const dataType =
        m.type ??
        (sourceName && m.field ? labels.getFieldDataType?.(sourceName, m.field) : undefined);
      return dataType === 'quantitative' ? `colored by ${l}` : `categorized by ${l}`;
    })
    .filter((c): c is string => !!c);

  return [`${chartType} of ${subject}`, ...clauses].join(', ');
}

/**
 * The field list between "of" and the first clause. An aggregation reads as
 * "{Measure} by {Dimension}" because that is the relationship being plotted;
 * two peer fields read as "{Y} and {X}".
 */
function buildSubject(
  mappings: MappingLike[],
  label: (m: MappingLike) => string | null,
  isMeasure: (m: MappingLike) => boolean,
): string | null {
  const measure = mappings.find(isMeasure);
  if (measure) {
    const measureLabel = label(measure);
    if (!measureLabel) return null;
    const dimensions: string[] = [];
    for (const m of mappings) {
      if (m === measure || isMeasure(m)) continue;
      const l = label(m);
      // Two encodings on one field must not produce "by Sex and Sex".
      if (l && l !== measureLabel && !dimensions.includes(l)) dimensions.push(l);
      if (dimensions.length === 2) break;
    }
    return dimensions.length > 0 ? `${measureLabel} by ${dimensions.join(' and ')}` : measureLabel;
  }

  const byEncoding = new Map<string, MappingLike>();
  for (const m of mappings) {
    if (m.encoding && !byEncoding.has(m.encoding)) byEncoding.set(m.encoding, m);
  }
  const x = byEncoding.get('x');
  const y = byEncoding.get('y');
  if (x && y) {
    const xl = label(x);
    const yl = label(y);
    if (xl && yl) return xl === yl ? yl : `${yl} and ${xl}`;
  }
  return label(y ?? x ?? mappings[0]);
}

/** The title-bearing fields of an ActiveVisualization, structurally typed so
 *  this module stays free of a store import (the store imports it). */
export interface VizTitleSource {
  spec: UDIGrammar;
  userPrompt: string;
  /** Assistant-written title from an older session. Nothing produces one now. */
  title?: string;
  userTitle?: string;
  /** Tokenized wording from the visualization template the agent used. */
  titleTemplate?: string;
  summaryTemplate?: string;
}

export interface VizTitleProvenance {
  /** What to show in the UI. */
  display: string;
  /** The assistant's title, if this card came from a session that had one. */
  original?: string;
  /** The user renamed this card. */
  isRenamed: boolean;
}

/**
 * The card's title. The wording from the visualization template the agent chose
 * leads, because it is friendlier than anything derivable from the spec alone;
 * `buildVizTitle` covers specs that came from no template — data-overview
 * pop-outs, imported sessions, and the LLM's free-form fallback.
 */
export function vizTitleProvenance(
  viz: VizTitleSource,
  labels: VizTitleLabels = {},
): VizTitleProvenance {
  const userTitle = viz.userTitle?.trim();
  const built =
    (viz.titleTemplate && renderTextTemplate(viz.titleTemplate, viz.spec, labels)) ||
    buildVizTitle(viz.spec, labels);
  const display = userTitle || built || viz.title || viz.userPrompt;
  return { display, original: viz.title, isRenamed: !!userTitle };
}

/** The template's one-line explanation of what the chart shows, if it had one. */
export function resolveVizSummary(
  viz: VizTitleSource,
  labels: VizTitleLabels = {},
): string | undefined {
  if (!viz.summaryTemplate) return undefined;
  return renderTextTemplate(viz.summaryTemplate, viz.spec, labels);
}

export function resolveVizTitle(viz: VizTitleSource, labels: VizTitleLabels = {}): string {
  return vizTitleProvenance(viz, labels).display;
}
