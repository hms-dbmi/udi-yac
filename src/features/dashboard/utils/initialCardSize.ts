import type { UDIGrammar } from 'udi-toolkit/react';
import type { CategoricalDomain, DataFieldDomain } from '@/types/dataPackage';
import { DEFAULT_CARD_H } from './gridDefaults';

interface SpecSourceRef {
  name?: string;
}
interface SpecMappingRef {
  field?: string;
  encoding?: string;
  type?: string;
}
interface SpecLayerRef {
  mark?: string;
  mapping?: SpecMappingRef | SpecMappingRef[];
}

/**
 * Estimate the row count needed to render a freshly-added chart with
 * enough vertical room for all its categorical values on the Y axis.
 *
 * Horizontal bar charts — anything with `y: { type: 'nominal' | 'ordinal' }`
 * bound to a real source field — need to scale vertically with the
 * cardinality of that field, otherwise label collisions force the user
 * to manually resize every new viz with a long category list (race,
 * organ, assay_type, …). Vertical bars / density plots / KDEs keep
 * DEFAULT_CARD_H because their information density scales with width,
 * not height.
 *
 * `pxNeeded` is a coarse estimate: ~25 px per row of categorical label +
 * ~80 px of chrome (card header + tweak row + x-axis labels). Rounding
 * up to whole row units then floored against DEFAULT_CARD_H keeps small
 * charts at the visual default and only grows when categories actually
 * demand it.
 *
 * `getDomainForField` typically routes to `dataPackageStore.getDomainForField`,
 * which only returns a populated entry once the domain-computation worker
 * has settled. Pre-domain (loading-phase) adds get DEFAULT_CARD_H — that's
 * acceptable; in practice the worker has long since finished by the time
 * the user is chatting and creating charts.
 */
export function computeInitialCardHeight(
  spec: UDIGrammar,
  getDomainForField: (entity: string, field: string) => DataFieldDomain | undefined,
  rowHeight: number,
): number {
  const src = spec.source as SpecSourceRef | SpecSourceRef[] | undefined;
  const entity = Array.isArray(src) ? src[0]?.name : src?.name;
  if (!entity) return DEFAULT_CARD_H;

  const layers: SpecLayerRef[] = Array.isArray(spec.representation)
    ? (spec.representation as SpecLayerRef[])
    : spec.representation
      ? [spec.representation as SpecLayerRef]
      : [];

  let pxNeeded = 0;
  for (const layer of layers) {
    if (layer.mark === 'row') continue;
    const mappings: SpecMappingRef[] = Array.isArray(layer.mapping)
      ? layer.mapping
      : layer.mapping
        ? [layer.mapping]
        : [];
    for (const m of mappings) {
      if (m?.encoding !== 'y' && m?.encoding !== 'x') continue;
      if (!m.field) continue;
      if (m.type !== 'nominal' && m.type !== 'ordinal') continue;
      const domain = getDomainForField(entity, m.field);
      if (!domain || domain.type !== 'point') continue;
      const values = (domain.domain as CategoricalDomain).values;
      const n = values?.length ?? 0;
      if (n === 0) continue;
      // Y categorical: bar per row, height grows with cardinality.
      // X categorical: vertical bars; height is mostly chart body + space for
      //   rotated/wrapped category labels along the bottom. Doesn't need to
      //   scale per-category, just needs a sane fixed baseline.
      const minRowHeight = 12;
      const need = m.encoding === 'y' ? 80 + n * minRowHeight : 340;
      if (need > pxNeeded) pxNeeded = need;
    }
  }
  if (pxNeeded === 0) return DEFAULT_CARD_H;
  return Math.max(DEFAULT_CARD_H, Math.ceil(pxNeeded / Math.max(1, rowHeight)));
}
