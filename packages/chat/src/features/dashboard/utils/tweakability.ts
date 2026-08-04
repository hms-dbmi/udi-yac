import type { UDIGrammar } from 'udi-toolkit/react';
import type { TemplateProvenance } from '../stores/dashboardStore';
import {
  collectLockedFields,
  collectGroupbyFields,
  collectRollupOutputs,
} from '@/utils/specMutations';
import type { LayerLike, MappingLike, TweakableParam } from '../components/VizTweakComponent.types';

type FieldMap = Record<string, string[]> | null;

function resolveSourceName(spec: UDIGrammar): string | null {
  const src = Array.isArray(spec.source)
    ? (spec.source as Array<{ name?: string }>)[0]
    : (spec.source as { name?: string } | undefined);
  return src?.name ?? null;
}

/**
 * Compute the tweakable parameters for a spec — the single source of truth
 * shared by VizTweakComponent (renders one dropdown per param) and
 * hasTweakableFields (gates the gear button). Keeping both on this function
 * means the panel and the gate can't drift.
 *
 * Each representation mapping (first per encoding, `row` marks skipped) is
 * classified into one of three kinds:
 *   - 'measure':   the mapping is bound to a rollup *output* column that has an
 *                  input field (mean/sum/… — not count/frequency). The swap
 *                  changes the aggregated input field; options are quantitative.
 *   - 'dimension': the mapping field is a group-by dimension in the raw schema.
 *                  The swap rewrites the groupby too; options are categorical.
 *   - 'field':     a plain in-schema field, not locked, not aggregated. Options
 *                  follow the mapping's type.
 * Mappings referencing a locked field (binby/kde/join) or a derived column with
 * no supported swap (e.g. a bare count output) are dropped.
 *
 * The option-list maps may be null (e.g. hasTweakableFields only needs to know
 * whether any param exists); in that case options come back empty.
 *
 * A spec the agent generated from a template takes a different path entirely —
 * see `templateParams` below.
 */
export function computeTweakableParams(
  spec: UDIGrammar,
  sourceFields: FieldMap,
  quantitativeSourceFields: FieldMap,
  categoricalSourceFields: FieldMap,
  template?: TemplateProvenance,
): TweakableParam[] {
  // A template-generated spec is re-bound, not rewritten, so its parameters come
  // from the template rather than from reading the spec back. The two modes are
  // exclusive on purpose: a heuristic rewrite would make the spec diverge from
  // its own instantiation, after which a re-bind would silently discard that
  // edit. Mode exclusivity keeps "this spec is exactly its instantiation" true
  // without a dirty flag.
  if (template && template.params.length > 0) {
    return templateParams(
      template,
      spec,
      sourceFields,
      quantitativeSourceFields,
      categoricalSourceFields,
    );
  }

  if (!spec.representation) return [];
  const sourceName = resolveSourceName(spec);
  if (!sourceName) return [];
  const entityFields = sourceFields?.[sourceName] ?? [];
  if (entityFields.length === 0) return [];

  const lockedFields = collectLockedFields(spec);
  const groupbyFields = collectGroupbyFields(spec);
  const rollupOutputs = collectRollupOutputs(spec);
  const quant = quantitativeSourceFields?.[sourceName] ?? [];
  const categorical = categoricalSourceFields?.[sourceName] ?? [];

  const representations = (
    Array.isArray(spec.representation) ? spec.representation : [spec.representation]
  ) as LayerLike[];

  const params: TweakableParam[] = [];
  const seen = new Set<string>();

  for (const layer of representations) {
    if (layer.mark === 'row') continue;
    const mappings: MappingLike[] = Array.isArray(layer.mapping)
      ? layer.mapping
      : layer.mapping
        ? [layer.mapping]
        : [];

    for (const m of mappings) {
      if (!m?.field || !m?.encoding || !m?.type) continue;
      if (seen.has(m.encoding)) continue;

      const field = m.field;
      const encoding = m.encoding;

      // measure: mapping bound to a rollup output column with an input field.
      const rollup = rollupOutputs[field];
      if (rollup) {
        if (!rollup.field) continue; // count/frequency — nothing to swap
        seen.add(encoding);
        params.push({
          field: rollup.field,
          encoding,
          label: encoding,
          options: quant,
          kind: 'measure',
          outputKey: field,
        });
        continue;
      }

      // Anything referencing a locked transform field is not swappable.
      if (lockedFields.has(field)) continue;
      // Beyond this point the field must exist in the raw source schema.
      if (!entityFields.includes(field)) continue;

      seen.add(encoding);
      if (groupbyFields.has(field)) {
        params.push({ field, encoding, label: encoding, options: categorical, kind: 'dimension' });
      } else {
        params.push({
          field,
          encoding,
          label: encoding,
          options: m.type === 'quantitative' ? quant : categorical,
          kind: 'field',
        });
      }
    }
  }

  return params;
}

/**
 * Controls for the parameters of the template a chart was generated from.
 *
 * The agent decides *which* parameters are offerable (it holds the template);
 * this only turns each descriptor into a control. Options come from the
 * descriptor's own entity, since a join template binds fields on two different
 * entities and only one of them is the spec's first source.
 */
function templateParams(
  template: TemplateProvenance,
  spec: UDIGrammar,
  sourceFields: FieldMap,
  quantitativeSourceFields: FieldMap,
  categoricalSourceFields: FieldMap,
): TweakableParam[] {
  const fallbackEntity = resolveSourceName(spec);
  return template.params.map((descriptor) => {
    const entity = descriptor.entity ?? fallbackEntity;
    const byType =
      descriptor.type === 'quantitative'
        ? quantitativeSourceFields
        : descriptor.type === 'nominal' || descriptor.type === 'ordinal'
          ? categoricalSourceFields
          : sourceFields;
    const options = (entity ? byType?.[entity] : undefined) ?? [];
    // The bound field always appears, even when the schema's declared type
    // disagrees with the template's requirement — a Select whose value is absent
    // from its items renders blank, which reads as a broken control.
    const withCurrent = options.includes(descriptor.value)
      ? options
      : [descriptor.value, ...options];
    return {
      kind: 'binding' as const,
      field: descriptor.value,
      label: descriptor.label,
      options: withCurrent,
      param: descriptor.param,
      placeholder: descriptor.placeholder,
    };
  });
}

/**
 * Returns true if the spec has at least one tweakable parameter. DashboardCard
 * calls this to decide whether the gear-toggle button is actionable — without
 * it the user could open a panel that just rendered `null`. Option lists aren't
 * needed to decide existence, so callers pass only `sourceFields`.
 *
 * Lives in `utils/` rather than alongside VizTweakComponent so the component
 * file stays component-only — exporting non-component helpers from a `.tsx`
 * breaks react-refresh.
 */
export function hasTweakableFields(
  spec: UDIGrammar,
  sourceFields: Record<string, string[]> | null,
  template?: TemplateProvenance,
): boolean {
  return computeTweakableParams(spec, sourceFields, null, null, template).length > 0;
}
