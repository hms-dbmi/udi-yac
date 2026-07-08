import type { UDIGrammar } from 'udi-toolkit/react';
import { collectLockedFields } from '@/utils/specMutations';
import type { LayerLike, MappingLike } from '../components/VizTweakComponent.types';

/**
 * Returns true if the spec has at least one mapping whose field could
 * be swapped via the tweak UI — a complete mapping (field + encoding +
 * type) bound to a real source field, not locked by a schema-defining
 * transformation (groupby / binby / kde / rollup.field / join.on), and
 * not a duplicate encoding within the same spec.
 *
 * DashboardCard calls this to decide whether the tweak-toggle button
 * is actionable; without it the user could open a panel that just
 * silently rendered `null` (count-of-groupby charts, binned / kde over
 * locked fields, etc.). Keeping the check in lockstep with
 * VizTweakComponent's `tweakableParams` memo means we won't drift if
 * the filter rules change there.
 *
 * Lives in `utils/` rather than alongside VizTweakComponent so the
 * component file stays component-only — exporting non-component
 * helpers from a `.tsx` breaks react-refresh.
 */
export function hasTweakableFields(
  spec: UDIGrammar,
  sourceFields: Record<string, string[]> | null,
): boolean {
  if (!spec.representation) return false;
  const src = Array.isArray(spec.source)
    ? (spec.source as Array<{ name?: string }>)[0]
    : (spec.source as { name?: string } | undefined);
  const sourceName = src?.name ?? null;
  if (!sourceName) return false;
  const entityFields = sourceFields?.[sourceName] ?? [];
  if (entityFields.length === 0) return false;
  const lockedFields = collectLockedFields(spec);
  const representations = (
    Array.isArray(spec.representation) ? spec.representation : [spec.representation]
  ) as LayerLike[];
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
      if (!entityFields.includes(m.field)) continue;
      if (lockedFields.has(m.field)) continue;
      if (seen.has(m.encoding)) continue;
      seen.add(m.encoding);
      return true;
    }
  }
  return false;
}
