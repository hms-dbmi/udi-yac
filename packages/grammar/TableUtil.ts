import type {
  Domain,
  NumberDomain,
  RowEncodingOptions,
  RowMapping,
  StringDomain,
} from './GrammarTypes';
import { interpolateYlOrRd, schemeSet3 } from 'd3-scale-chromatic';

export function getDomainLookupKey(mapping: RowMapping): string {
  const { column, field, type } = mapping;
  return `${column}¶${field}¶${type}`;
}

export interface ExtendedRowMapping extends RowMapping {
  /**
   * Absent for encodings that never consult a scale — see
   * {@link mappingNeedsDomain}.
   */
  domain?: Domain;
  layer: string;
}

/**
 * Encodings whose value UDICellRenderer's `getStyle` runs through a d3 scale.
 * These are exactly the `case` labels of that switch; every other encoding hits
 * its `default: break`.
 *
 * `text` is the notable omission: the cell's text comes from `getTextValue`,
 * which reads the raw field value, so a text mapping needs no domain at all.
 * `shape` has no case either.
 */
const SCALED_ENCODINGS = new Set<RowEncodingOptions>([
  'color',
  'x',
  'x2',
  'y',
  'yOffset',
  'xOffset',
  'size',
]);

/**
 * Whether a mapping's rendered output depends on a scale, and therefore on a
 * domain. Deriving a domain means scanning a whole column, so for an
 * all-fields table (`field: '*'`, one text mapping per source column) computing
 * them anyway cost 258 full-column scans of a 9474-row source — measured at
 * 7.2s before `transformedData` became a `shallowRef` and 742ms after, for
 * values nothing ever read.
 *
 * Shared with `getStyle` so the two cannot disagree: if a new `case` is added
 * to that switch without adding the encoding here, the mapping is skipped
 * there too and the case is visibly dead rather than silently mis-scaled.
 */
export function mappingNeedsDomain(mapping: RowMapping): boolean {
  return SCALED_ENCODINGS.has(mapping.encoding);
}

export function getNumberDomain(
  data: Record<string, unknown>[],
  fields: string | string[],
): NumberDomain {
  const fieldList = typeof fields === 'string' ? [fields] : fields;
  if (fieldList.length === 0) {
    throw new Error('Field list is empty');
  }

  let min = Infinity;
  let max = -Infinity;
  for (const field of fieldList) {
    // Coercion is reported once per field, not once per cell: a wide table of
    // mostly-string columns typed `quantitative` would otherwise emit millions
    // of console.warn calls with string interpolation and hang the tab.
    let coerced = 0;
    let firstCoerced: unknown;
    for (const d of data) {
      const value = d[field];
      if (value === null || value === undefined) {
        continue;
      }
      let numberValue: number;
      if (typeof value !== 'number') {
        numberValue = +value;
        if (coerced === 0) firstCoerced = value;
        coerced++;
      } else {
        numberValue = value;
      }
      if (numberValue < min) {
        min = numberValue;
      }
      if (numberValue > max) {
        max = numberValue;
      }
    }
    if (coerced > 0) {
      console.warn(
        `Values for field ${field} are not numbers: coerced ${coerced} value(s), first was ${String(firstCoerced)}.`,
      );
    }
  }
  return { min, max };
}

export function getStringDomain(
  data: Record<string, unknown>[],
  fields: string | string[],
): StringDomain {
  const fieldList = typeof fields === 'string' ? [fields] : fields;
  if (fieldList.length === 0) {
    throw new Error('Field list is empty');
  }
  const values = new Set<string>();
  for (const field of fieldList) {
    for (const d of data) {
      const value = d[field];
      if (value === null || value === undefined) continue;
      values.add(value as string);
    }
  }
  return Array.from(values);
}

/**
 * Derives the scale domain for every mapping that needs one, keyed by
 * {@link getDomainLookupKey}. Mappings that share a key are computed once, and
 * mappings whose encoding never consults a scale are skipped entirely.
 */
export function computeFieldDomains(
  mappings: RowMapping[] | null,
  data: Record<string, unknown>[] | null,
): Map<string, Domain> {
  const domainMap = new Map<string, Domain>();
  if (!mappings || !data) return domainMap;

  for (const mapping of mappings) {
    if (!mappingNeedsDomain(mapping)) continue;
    const k = getDomainLookupKey(mapping);
    if (domainMap.has(k)) continue;

    if (mapping.domain) {
      if ('numberFields' in mapping.domain) {
        domainMap.set(k, getNumberDomain(data, mapping.domain.numberFields));
        continue;
      } else if ('categoryFields' in mapping.domain) {
        domainMap.set(k, getStringDomain(data, mapping.domain.categoryFields));
        continue;
      } else {
        domainMap.set(k, mapping.domain);
        if (Array.isArray(mapping.domain)) {
          continue;
        }
        if ('min' in mapping.domain && 'max' in mapping.domain) {
          continue;
        }
        // The only scenario we don't continue is when domain is a partial domain
      }
    }

    if (mapping.type === 'quantitative') {
      const domain = getNumberDomain(data, mapping.field);
      const partialDomain = domainMap.get(k) ?? {};
      domainMap.set(k, { ...domain, ...partialDomain });
    } else if (mapping.type === 'nominal' || mapping.type === 'ordinal') {
      domainMap.set(k, getStringDomain(data, mapping.field));
    }
  }
  return domainMap;
}

export const defaultRange = {
  quantitative: [0, 1],
  unknownQuantitative: 0,
  quantitativeColor: (t: number) => interpolateYlOrRd((t + 0.15) / 1.15),
  unknownColor: '#EB10E0',
  nominalColor: schemeSet3,
};
