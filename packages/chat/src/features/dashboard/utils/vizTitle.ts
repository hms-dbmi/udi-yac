import type { UDIGrammar } from 'udi-toolkit/react';
import { collectRollupOutputs, type RollupOutput } from '@/utils/specMutations';
import { humanizeFieldName } from '@/utils/humanize';

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

  return { sourceName, entityLabel, label, isMeasure };
}

/**
 * A copy of the spec with every unlabelled encoding given a `title`, which the
 * toolkit passes through to the Vega encoding — so axis labels, legends and
 * tooltip keys read "Weight" rather than "weight_value".
 *
 * Render-time only. The stored spec keeps raw field names, because that is what
 * export, the reset-to-original comparison, and the query compiler all read.
 */
export function applyFieldLabels(spec: UDIGrammar, labels: VizTitleLabels = {}): UDIGrammar {
  if (!spec?.representation) return spec;
  const { label } = makeLabeler(spec, labels);

  let changed = false;
  const labelMapping = (m: MappingLike): MappingLike => {
    // An explicit title from the spec author always wins, and a row layer's
    // `*` wildcard has no single field to name.
    if (m.title || !m.field || m.field === '*') return m;
    const l = label(m);
    if (!l || l === m.field) return m;
    changed = true;
    return { ...m, title: l };
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
}

export interface VizTitleProvenance {
  /** What to show in the UI. */
  display: string;
  /** The assistant's title, if this card came from a session that had one. */
  original?: string;
  /** The user renamed this card. */
  isRenamed: boolean;
}

export function vizTitleProvenance(
  viz: VizTitleSource,
  labels: VizTitleLabels = {},
): VizTitleProvenance {
  const userTitle = viz.userTitle?.trim();
  const display = userTitle || buildVizTitle(viz.spec, labels) || viz.title || viz.userPrompt;
  return { display, original: viz.title, isRenamed: !!userTitle };
}

export function resolveVizTitle(viz: VizTitleSource, labels: VizTitleLabels = {}): string {
  return vizTitleProvenance(viz, labels).display;
}
