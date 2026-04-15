import type { UDIGrammar } from 'udi-toolkit/react';

interface MappingLike {
  field?: string;
  encoding?: string;
  type?: string;
  [key: string]: unknown;
}

interface RepresentationLike {
  mark?: string;
  mapping?: MappingLike | MappingLike[];
  [key: string]: unknown;
}

/**
 * Return a new spec with every mapping whose `encoding` matches `encoding`
 * rewritten to use `newField`. All other parts of the spec — including
 * mappings on different encodings, transformation pipelines, source.name,
 * and named filters — are left untouched.
 *
 * Replaces the historical string-replace approach (`JSON.stringify(spec)
 * .replace(/"oldField"/g, '"newField"')`), which had three problems:
 *   1. It updated EVERY occurrence of the string, so two encodings bound to
 *      the same field (e.g. a density plot with both axes on `age_value`)
 *      would change together when only one was meant to.
 *   2. It silently rewrote transformations and source references that
 *      happened to mention the field by name.
 *   3. The regex was unescaped — field names containing `.` (e.g.
 *      `donor.hubmap_id`) matched arbitrary characters, causing collisions.
 *
 * If `encoding` is not present in any layer's mapping, returns the original
 * spec object unchanged so callers can compare by reference to detect no-ops.
 */
export function setMappingFieldByEncoding(
  spec: UDIGrammar,
  encoding: string,
  newField: string,
): UDIGrammar {
  if (!spec.representation) return spec;
  let didChange = false;

  const updateLayer = (layer: RepresentationLike): RepresentationLike => {
    if (layer == null || typeof layer !== 'object') return layer;
    const mapping = layer.mapping;
    if (mapping == null) return layer;

    const updateMapping = (m: MappingLike): MappingLike => {
      if (m?.encoding === encoding && m.field !== newField) {
        didChange = true;
        return { ...m, field: newField };
      }
      return m;
    };

    if (Array.isArray(mapping)) {
      const nextMappings = mapping.map(updateMapping);
      return { ...layer, mapping: nextMappings };
    }
    return { ...layer, mapping: updateMapping(mapping) };
  };

  const nextRepresentation = Array.isArray(spec.representation)
    ? (spec.representation as RepresentationLike[]).map(updateLayer)
    : updateLayer(spec.representation as RepresentationLike);

  if (!didChange) return spec;
  return { ...spec, representation: nextRepresentation } as UDIGrammar;
}
