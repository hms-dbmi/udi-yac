/**
 * Record links: a host-supplied function maps one row of a chart or table to
 * the URL of that record's own page (a dataset, a donor, a patient). Tables
 * show it as a leading link column and point marks open it on a plain click.
 * Separately, a table cell whose value is itself an http(s) URL renders as a
 * link with no configuration.
 */

/**
 * Builds the URL of the page for one record. `source` is the spec's primary
 * source (entity) name. Return null/undefined for a row with no page — an
 * aggregated row, say, which carries no record id. Only http(s) URLs are
 * followed; a relative URL resolves against the page's base URL.
 */
export type RecordUrlFn = (
  record: Record<string, unknown>,
  source: string,
) => string | null | undefined;

/** The column a chart's rows carry their record URL in. */
export const RECORD_URL_FIELD = '__udi_record_url';

/** `value` as an absolute http(s) URL, or null for anything else (`javascript:`, `data:`, …). */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value, globalThis.document?.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The record's link, if the host's function gives a followable one. A throwing function means no link, not a broken chart. */
export function recordLink(
  fn: RecordUrlFn | undefined,
  record: Record<string, unknown>,
  source: string,
): string | null {
  if (!fn) return null;
  try {
    return safeHref(fn(record, source));
  } catch {
    return null;
  }
}

/** A cell value that is an absolute http(s) URL, else null. Relative paths stay text. */
export function cellLink(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value)
    ? safeHref(value)
    : null;
}
