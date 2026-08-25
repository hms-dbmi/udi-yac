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
