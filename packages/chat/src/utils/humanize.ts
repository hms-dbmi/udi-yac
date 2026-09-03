/**
 * Turn a column or entity name into title-case prose: `body_mass_index_value` →
 * `Body Mass Index`. The trailing `_value` that the HuBMAP schema puts on its
 * measurement columns carries no meaning in a label, so it is dropped.
 *
 * Tokens that already contain an uppercase letter are left alone, so a schema
 * that names a column `hubmapID` or `mRNA_count` keeps its own casing rather
 * than being flattened to `Hubmapid`.
 *
 * This is the *fallback*. A package author who wants `BMI` rather than
 * `Body Mass Index` says so with a `title` on the field; see the data package
 * store's `getFieldLabel`.
 */
export function humanizeFieldName(name: string): string {
  const stripped = name.replace(/_value$/i, '');
  const words = (stripped || name)
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
  return words.length > 0 ? words.join(' ') : name;
}

/**
 * Irregular plurals worth knowing about in a biomedical schema. Anything not
 * listed falls to the suffix rules below.
 */
const IRREGULAR_SINGULARS: Record<string, string> = {
  analyses: 'analysis',
  criteria: 'criterion',
  indices: 'index',
  matrices: 'matrix',
  people: 'person',
  children: 'child',
};

/**
 * The singular of a display label, for prose that counts one thing at a time:
 * "a point for each Donor", not "for each Donors".
 *
 * Only the last word changes, so "Tissue Samples" → "Tissue Sample". Words that
 * merely end in `s` without being plural (Analysis, Status) are left alone. This
 * is a heuristic — a package whose entity name it gets wrong is best fixed by
 * adding the word to `IRREGULAR_SINGULARS`.
 */
export function singularizeLabel(label: string): string {
  const match = /^(.*?)([A-Za-z]+)$/.exec(label);
  if (!match) return label;
  const [, prefix, word] = match;
  const lower = word.toLowerCase();

  const singular = (() => {
    if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower];
    if (lower.length > 4 && lower.endsWith('ies')) return lower.slice(0, -3) + 'y';
    if (/(sses|shes|ches|xes|zes)$/.test(lower)) return lower.slice(0, -2);
    // `ss`/`us`/`is`/`as`/`os` endings are singular already (Status, Analysis).
    if (lower.endsWith('s') && !/(ss|us|is|as|os)$/.test(lower)) return lower.slice(0, -1);
    return lower;
  })();

  if (singular === lower) return label;
  // Restore the original casing pattern: Donors → Donor, DONORS → DONOR.
  const cased =
    word === word.toUpperCase()
      ? singular.toUpperCase()
      : word[0] === word[0].toUpperCase()
        ? singular[0].toUpperCase() + singular.slice(1)
        : singular;
  return prefix + cased;
}
