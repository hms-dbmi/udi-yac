let warned = false;

/**
 * The toolkit's layout rules ship in udi-toolkit/style.css, which a custom
 * element or React host has to import itself. Without them a chart sizes to
 * 0×0 with no error, so say so, once per page. `wrap` is VegaLite's root, whose
 * `position: relative` only that sheet sets.
 */
export function warnIfUnstyled(wrap: Element | null | undefined): void {
  if (warned || !wrap || getComputedStyle(wrap).position === 'relative') return;
  warned = true;
  console.warn(
    "udi-toolkit: charts are unstyled and may render blank. Import 'udi-toolkit/style.css'.",
  );
}
