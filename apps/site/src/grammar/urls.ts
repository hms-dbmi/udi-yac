// CommonJS: named imports fail when the pages are prerendered.
import LZString from 'lz-string';
import type { UDIGrammar } from 'udi-toolkit';

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** The editor, opened on `spec`. Same encoding the old Quasar demo used in its
 *  `#/Editor?spec=` links, so those still decode. */
export function editorHref(spec: UDIGrammar): string {
  return `${base}grammar/editor/?spec=${LZString.compressToEncodedURIComponent(JSON.stringify(spec, null, 2))}`;
}

/** Specs name their data page-relative (`./data/penguins.csv`), which keeps them
 *  portable in share links but would resolve against whichever page renders
 *  them. Resolve against the site's data directory instead (`public/app/data`,
 *  synced from sample-data/); absolute URLs pass through. Browser only. */
export function resolveSpec(spec: UDIGrammar): UDIGrammar {
  const dataBase = new URL(`${base}app/`, location.origin);
  // Typed loosely: the editor passes whatever JSON the user typed.
  const resolve = (source: { source?: unknown }) =>
    typeof source?.source === 'string'
      ? { ...source, source: new URL(source.source, dataBase).href }
      : source;
  return {
    ...spec,
    source: Array.isArray(spec.source) ? spec.source.map(resolve) : resolve(spec.source),
  } as UDIGrammar;
}
