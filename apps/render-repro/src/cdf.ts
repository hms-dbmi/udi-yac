/**
 * The grouped-CDF pipeline, in plain JS.
 *
 * A hand port of what the Arquero executor does for template 50 — filter to the
 * mass range, group by species, order by mass, and give each row its running
 * fraction of its group. It exists so the raw harness can recompute rows for an
 * arbitrary range without the toolkit, which is what lets the brush drive the
 * data there as it does in the real app.
 *
 * `verifyAgainstFrames` checks it against row sets the real executor produced, so
 * a divergence here can never be mistaken for the rendering bug we are chasing.
 */
export type Row = {
  species: string;
  body_mass_g: number;
  total: number;
  percentile: number;
};

export function computeCdf(
  source: { species: string; body_mass_g: number }[],
  range: [number, number] | null,
): Row[] {
  const kept = source.filter(
    (r) =>
      Number.isFinite(r.body_mass_g) &&
      (!range || (r.body_mass_g >= range[0] && r.body_mass_g <= range[1])),
  );
  const byGroup = new Map<string, { species: string; body_mass_g: number }[]>();
  for (const r of kept) {
    const g = byGroup.get(r.species);
    if (g) g.push(r);
    else byGroup.set(r.species, [r]);
  }
  const out: Row[] = [];
  for (const [species, rows] of byGroup) {
    const sorted = [...rows].sort((a, b) => a.body_mass_g - b.body_mass_g);
    const total = sorted.length;
    sorted.forEach((r, i) => {
      out.push({
        species,
        body_mass_g: r.body_mass_g,
        total,
        percentile: (i + 1) / total,
      });
    });
  }
  // The template orders by percentile last.
  return out.sort((a, b) => a.percentile - b.percentile);
}

/** Compare against the executor's own output; returns a human-readable verdict. */
export function verifyAgainstFrames(
  source: { species: string; body_mass_g: number }[],
  frames: { range: [number, number]; rows: Row[] }[],
): string {
  const key = (r: Row) =>
    `${r.species}|${r.body_mass_g}|${r.total}|${r.percentile.toFixed(9)}`;
  for (const [i, f] of frames.entries()) {
    const mine = computeCdf(source, f.range);
    if (mine.length !== f.rows.length) {
      return `frame ${i}: ${mine.length} rows vs executor's ${f.rows.length}`;
    }
    const a = mine.map(key).sort();
    const b = f.rows.map(key).sort();
    const bad = a.findIndex((x, j) => x !== b[j]);
    if (bad !== -1)
      return `frame ${i}: row ${bad} differs — ${a[bad]} vs ${b[bad]}`;
  }
  return `matches the executor on all ${frames.length} frames`;
}
