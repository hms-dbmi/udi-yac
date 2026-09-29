import type { UDIGrammar } from 'udi-toolkit/react';
import { toLayers, toMappings, type MappingLike } from './vizTitle';

const CATEGORICAL_TYPES = new Set(['nominal', 'ordinal']);

/**
 * A copy of the spec whose bar layers order their category axis by bar total,
 * largest first — or null when no bar layer plots a categorical axis against a
 * quantitative one, which is when the card has no sort toggle to offer.
 *
 * The toolkit orders categories alphabetically unless a mapping says otherwise,
 * and computes either order from the unfiltered data, so neither moves as
 * filters apply. Color is left alone: it keeps its alphabetical domain, so
 * switching the order never recolors a stack.
 *
 * Render-time only, like `applyFieldLabels`: a template-generated spec must stay
 * equal to its instantiation, or the next rebind would silently discard this.
 */
export function sortCategoriesByTotal(spec: UDIGrammar): UDIGrammar | null {
  let changed = false;
  const layers = toLayers(spec?.representation).map((layer) => {
    if (layer.mark !== 'bar' || !layer.mapping) return layer;
    const mappings = toMappings(layer.mapping);
    const isQuantitative = (encoding: string) =>
      mappings.some((m) => m.encoding === encoding && m.field && m.type === 'quantitative');
    const sortMapping = (m: MappingLike) => {
      if (!m.field || !CATEGORICAL_TYPES.has(m.type ?? '')) return m;
      const by = m.encoding === 'x' ? 'y' : m.encoding === 'y' ? 'x' : null;
      if (!by || !isQuantitative(by)) return m;
      changed = true;
      return { ...m, sort: `-${by}` };
    };
    return {
      ...layer,
      mapping: Array.isArray(layer.mapping)
        ? layer.mapping.map(sortMapping)
        : sortMapping(layer.mapping),
    };
  });
  if (!changed) return null;

  return {
    ...spec,
    representation: Array.isArray(spec.representation) ? layers : layers[0],
  } as UDIGrammar;
}
