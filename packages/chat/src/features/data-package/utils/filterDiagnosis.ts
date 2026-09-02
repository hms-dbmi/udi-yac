/**
 * Why an LLM-authored `FilterData` call can't be satisfied, and what to offer
 * instead.
 *
 * The model only ever sees a *sample* of each field's values (the agent's
 * `simplify_data_domains` prints 5 of N), so it regularly names a value that
 * doesn't exist. Fields also come and go: HuBMAP dropped `assay_type`
 * entirely, and a model still asking to filter it by "Xenium" is asking for a
 * value that is real (`dataset_type` has it) under a field that is not. Before
 * this module either miss was dropped in `syncFiltersFromMessages` and
 * rendered as an empty chat bubble.
 *
 * Pure: reads the already-loaded schema and domains, never fetches. Lives in
 * `data-package` rather than `tool-calls` because `dataPackageStore` shares
 * `normalizePointValues` and features may only import each other's barrels.
 */

import type { CategoricalDomain, DataFieldDomain } from '@/types/dataPackage';
import type { LoadingPhase } from '../stores/dataPackageStore';
import { categoricalValues } from './entityOverview';

/** Most other (entity, field) pairs to name when a value lives elsewhere. */
const CROSS_FIELD_LIMIT = 3;
/** Most same-field near-miss values, entity names, or field names to offer. */
const NEARBY_LIMIT = 5;

export interface FilterProbe {
  entity: string;
  field: string;
  kind: 'point' | 'interval';
  /** Requested point values. Ignored for interval probes. */
  values?: readonly unknown[];
}

export interface FilterDiagnosisContext {
  sourceFields: Record<string, string[]> | null;
  entityNames: readonly string[];
  dataFieldDomains: readonly DataFieldDomain[];
  loadingPhase: LoadingPhase;
}

/** A value the requested field really has, offered as a fix. */
export interface ValueSuggestion {
  value: string;
  /** `case`: differs only in capitalisation, so it's a one-click correction. */
  via: 'case' | 'substring';
}

/** Another (entity, field) whose domain contains the requested value. */
export interface FieldSuggestion {
  entity: string;
  field: string;
  /** The domain's own spelling, which may differ in case from the request. */
  value: string;
  sameEntity: boolean;
}

export type FilterDiagnosis =
  | { kind: 'ok' }
  | { kind: 'loading' }
  | { kind: 'unknown-entity'; entity: string; nearbyEntities: string[] }
  | {
      kind: 'unknown-field';
      entity: string;
      field: string;
      nearbyFields: string[];
      otherFields: FieldSuggestion[];
    }
  | {
      kind: 'unverifiable';
      entity: string;
      field: string;
      reason: 'no-domain' | 'wrong-domain-type';
    }
  | { kind: 'empty-request'; entity: string; field: string; options: string[] }
  | {
      kind: 'partial-match';
      entity: string;
      field: string;
      present: string[];
      missing: string[];
      nearby: ValueSuggestion[];
      otherFields: FieldSuggestion[];
      options: string[];
    }
  | {
      kind: 'no-match';
      entity: string;
      field: string;
      missing: string[];
      nearby: ValueSuggestion[];
      otherFields: FieldSuggestion[];
      options: string[];
    };

/**
 * The point values a request is actually asking for.
 *
 * Two sources of noise collapse to "nothing was asked for": the agent defaults
 * a missing `pointValues` to `[""]` (orchestrator.py `_handle_filter_data`),
 * and clearing the widget commits `[]`. Neither means "filter to the blank
 * value" — which matters because a blank IS a genuine distinct value in real
 * data (HuBMAP's `assay_category` is blank on most rows, so the blank is a
 * genuine member of its domain), so passing `[""]` through would silently
 * filter to the blanks.
 */
export function normalizePointValues(values: readonly unknown[] | undefined): string[] {
  return (values ?? []).filter((v) => v != null && String(v).trim() !== '').map((v) => String(v));
}

/** Names matching `needle` as a substring in either direction, capped. */
function nearbyNames(needle: string, candidates: readonly string[]): string[] {
  const q = needle.toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const c of candidates) {
    const lc = c.toLowerCase();
    if (lc.includes(q) || q.includes(lc)) {
      out.push(c);
      if (out.length >= NEARBY_LIMIT) break;
    }
  }
  return out;
}

/**
 * Values the field really has that resemble one the model invented.
 *
 * Two ordered tiers so the caller can treat a pure capitalisation miss as a
 * one-click fix: exact-but-for-case first, then substring in either direction
 * (catches "CODEX-2" → "CODEX" and "Xenium" → "Xenium 5K"). Deliberately no
 * edit distance — the failure mode here is hallucinated-but-plausible, not
 * mistyped, so Levenshtein would add cost for a case that doesn't occur.
 */
function nearMisses(missing: readonly string[], options: readonly string[]): ValueSuggestion[] {
  const seen = new Set<string>();
  const byCase: ValueSuggestion[] = [];
  const bySubstring: ValueSuggestion[] = [];

  for (const needle of missing) {
    const q = needle.toLowerCase();
    if (!q) continue;
    for (const value of options) {
      if (seen.has(value)) continue;
      const lc = value.toLowerCase();
      if (lc === q) {
        seen.add(value);
        byCase.push({ value, via: 'case' });
      } else if (lc.includes(q) || q.includes(lc)) {
        seen.add(value);
        bySubstring.push({ value, via: 'substring' });
      }
    }
  }
  return [...byCase, ...bySubstring].slice(0, NEARBY_LIMIT);
}

/**
 * Other fields whose domain contains one of the missing values — the "you
 * asked the wrong column" hint.
 *
 * Scans the requested entity first so same-entity hits fill the cap before
 * distant ones. The length guard before `toLowerCase()` is what keeps this
 * cheap: the whole HuBMAP package is ~70k distinct strings (id-like columns
 * carry one per row), and an integer compare rejects almost all of them with
 * no allocation. Large domains are deliberately NOT skipped — a mis-scoped id
 * is exactly the case worth catching.
 */
function crossFieldMatches(
  missing: readonly string[],
  entity: string,
  field: string,
  domains: readonly DataFieldDomain[],
): FieldSuggestion[] {
  const needles = missing.map((v) => v.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return [];

  const out: FieldSuggestion[] = [];
  const scan = (sameEntity: boolean) => {
    for (const d of domains) {
      if (out.length >= CROSS_FIELD_LIMIT) return;
      if (d.type !== 'point') continue;
      if ((d.entity === entity) !== sameEntity) continue;
      if (d.entity === entity && d.field === field) continue;

      const values = (d.domain as CategoricalDomain).values;
      if (!values) continue;
      for (const value of values) {
        if (value == null) continue;
        const len = value.length;
        const hit = needles.some((n) => n.length === len && value.toLowerCase() === n);
        if (!hit) continue;
        out.push({ entity: d.entity, field: d.field, value, sameEntity });
        break;
      }
    }
  };

  scan(true);
  scan(false);
  return out;
}

/**
 * Classify a filter request against the loaded package.
 *
 * `ok` and `unverifiable` mean "render the real widget"; `loading` means
 * "render nothing yet"; everything else means "render the notice". Callers
 * should treat this as an exhaustive switch.
 */
export function diagnoseFilter(probe: FilterProbe, ctx: FilterDiagnosisContext): FilterDiagnosis {
  const { entity, field, kind } = probe;
  const { sourceFields, entityNames, dataFieldDomains, loadingPhase } = ctx;

  // Domains stream in per entity, so a verdict reached before they land could
  // claim "no matching values" for a field whose domain simply hasn't arrived.
  if (loadingPhase !== 'ready' || !sourceFields) return { kind: 'loading' };

  const fields = sourceFields[entity];
  if (!fields) {
    return { kind: 'unknown-entity', entity, nearbyEntities: nearbyNames(entity, entityNames) };
  }

  if (!fields.includes(field)) {
    return {
      kind: 'unknown-field',
      entity,
      field,
      nearbyFields: nearbyNames(field, fields),
      otherFields: crossFieldMatches(
        normalizePointValues(probe.values),
        entity,
        field,
        dataFieldDomains,
      ),
    };
  }

  const domain = dataFieldDomains.find((d) => d.entity === entity && d.field === field);
  if (!domain) return { kind: 'unverifiable', entity, field, reason: 'no-domain' };

  const wantedType = kind === 'interval' ? 'interval' : 'point';
  if (domain.type !== wantedType) {
    return { kind: 'unverifiable', entity, field, reason: 'wrong-domain-type' };
  }
  if (kind === 'interval') return { kind: 'ok' };

  // Validate against the RAW domain values (nulls and blanks included) so a
  // brush click on a null cell stays legitimate; offer the CLEANED list for
  // display so the picker never shows an empty checkbox.
  const rawValues = (domain.domain as CategoricalDomain).values;
  if (!rawValues) return { kind: 'unverifiable', entity, field, reason: 'no-domain' };
  const options = categoricalValues(domain);

  const requested = normalizePointValues(probe.values);
  // An empty request is NOT a failure: `handleClearAll` and unticking the last
  // box both commit `{[field]: []}`, and diagnosing that as a miss would flip
  // a working widget into the notice mid-interaction.
  if (requested.length === 0) return { kind: 'empty-request', entity, field, options };

  const present: string[] = [];
  const missing: string[] = [];
  for (const v of requested) (rawValues.includes(v) ? present : missing).push(v);
  if (missing.length === 0) return { kind: 'ok' };

  const nearby = nearMisses(missing, options);
  const otherFields = crossFieldMatches(missing, entity, field, dataFieldDomains);

  return present.length > 0
    ? { kind: 'partial-match', entity, field, present, missing, nearby, otherFields, options }
    : { kind: 'no-match', entity, field, missing, nearby, otherFields, options };
}
