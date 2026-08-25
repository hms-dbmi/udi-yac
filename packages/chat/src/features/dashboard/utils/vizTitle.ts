import type { UDIGrammar } from 'udi-toolkit/react';
import { collectRollupOutputs, type RollupOutput } from '@/utils/specMutations';

/**
 * Card titles have three layers, resolved by `vizTitleProvenance`:
 *
 *   - `title`         the agent's original title from the RenderVisualization
 *                     tool call. Never mutated — it is the provenance record.
 *   - `baseAutoTitle` what `deriveTitleFromSpec` returned for the spec at the
 *                     moment the card was created. Only a drift baseline.
 *   - `userTitle`     an explicit rename. Wins over everything until cleared.
 *
 * The *current* auto title is deliberately not stored: it is recomputed from
 * `spec` on read, so a field swap in VizTweakComponent needs no store
 * bookkeeping and swapping back (A→B→A) restores the original prose title.
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

/**
 * Turn a column name into title-case prose: `body_mass_index_value` →
 * `Body Mass Index`. The trailing `_value` that the HuBMAP schema puts on its
 * measurement columns carries no meaning in a title, so it is dropped.
 *
 * Tokens that already contain an uppercase letter are left alone, so a schema
 * that names a column `hubmapID` or `mRNA_count` keeps its own casing rather
 * than being flattened to `Hubmapid`.
 */
export function humanizeFieldName(name: string): string {
  const stripped = name.replace(/_value$/i, '');
  const words = (stripped || name)
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
  return words.length > 0 ? words.join(' ') : name;
}

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

/**
 * Label one encoding. An explicit `mapping.title` is already prose and is used
 * as-is; anything derived from a column name goes through `humanizeFieldName`.
 */
function labelFor(
  m: MappingLike,
  rollupOutputs: Record<string, RollupOutput>,
  sourceName: string | null,
): string | null {
  if (!m.field || m.field === '*') return null;
  if (m.title) return m.title;

  const rollup = rollupOutputs[m.field];
  if (!rollup) return humanizeFieldName(m.field);

  const op = rollup.op ? (OP_LABELS[rollup.op] ?? rollup.op) : null;
  if (!op) return humanizeFieldName(m.field);
  // count / frequency aggregate rows rather than a column, so they read as
  // "Count of Donors"; the rest name their input: "Average Age".
  if (!rollup.field) return sourceName ? `${op} of ${humanizeFieldName(sourceName)}` : op;
  return `${op} ${humanizeFieldName(rollup.field)}`;
}

/**
 * A short title describing what the spec currently plots, or `undefined` when
 * nothing usable can be derived (the caller then falls back to the original
 * title or the user prompt).
 *
 * Shapes produced:
 *   aggregated chart  "Count of Donors by Sex" / "… by Sex and Race"
 *   two plain axes    "Weight vs Body Mass Index"
 *   single encoding   "Age"
 *   table / row layer "Donors rows"
 */
export function deriveTitleFromSpec(spec: UDIGrammar): string | undefined {
  const sourceName = resolveSourceName(spec);
  const rowsTitle = sourceName ? `${humanizeFieldName(sourceName)} rows` : undefined;

  // No representation at all means the toolkit's parser defaults to a row
  // layer over every column — same as an explicit `mark: 'row'` table.
  const chart = toLayers(spec.representation).find((l) => l && l.mark !== 'row');
  if (!chart) return rowsTitle;

  const rollupOutputs = collectRollupOutputs(spec);
  const mappings = toMappings(chart.mapping).filter((m) => m?.field && m.field !== '*');
  if (mappings.length === 0) return rowsTitle;

  const label = (m: MappingLike) => labelFor(m, rollupOutputs, sourceName);
  const isMeasure = (m: MappingLike) => !!m.field && m.field in rollupOutputs;

  const measure = mappings.find(isMeasure);
  if (measure) {
    const dimLabels: string[] = [];
    for (const m of mappings) {
      if (m === measure || isMeasure(m)) continue;
      const l = label(m);
      // Two encodings on one field (e.g. x and color both on `sex`) must not
      // produce "by sex and sex".
      if (l && !dimLabels.includes(l)) dimLabels.push(l);
      if (dimLabels.length === 2) break;
    }
    const measureLabel = label(measure);
    if (!measureLabel) return rowsTitle;
    return dimLabels.length > 0 ? `${measureLabel} by ${dimLabels.join(' and ')}` : measureLabel;
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
    if (xl && yl) return xl === yl ? yl : `${yl} vs ${xl}`;
  }
  return label(y ?? x ?? mappings[0]) ?? rowsTitle;
}

/** The title-bearing fields of an ActiveVisualization, structurally typed so
 *  this module stays free of a store import (the store imports it). */
export interface VizTitleSource {
  spec: UDIGrammar;
  userPrompt: string;
  title?: string;
  baseAutoTitle?: string;
  userTitle?: string;
}

export interface VizTitleProvenance {
  /** What to show in the UI. */
  display: string;
  /** The agent's original title, if it had one. */
  original?: string;
  /** What the current spec derives to, if anything. */
  auto?: string;
  /** The user renamed this card. */
  isRenamed: boolean;
  /** The spec has been tweaked away from what `original` described. */
  isDrifted: boolean;
}

export function vizTitleProvenance(viz: VizTitleSource): VizTitleProvenance {
  const userTitle = viz.userTitle?.trim();
  const auto = deriveTitleFromSpec(viz.spec);
  const isDrifted = !!auto && !!viz.baseAutoTitle && auto !== viz.baseAutoTitle;

  let display: string;
  if (userTitle) display = userTitle;
  else if (isDrifted) display = auto!;
  else display = viz.title ?? auto ?? viz.userPrompt;

  return { display, original: viz.title, auto, isRenamed: !!userTitle, isDrifted };
}

export function resolveVizTitle(viz: VizTitleSource): string {
  return vizTitleProvenance(viz).display;
}
