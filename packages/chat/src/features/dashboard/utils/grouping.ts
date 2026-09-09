/**
 * The client half of a stratifier grouping.
 *
 * A grouping says how a stratifier's values become the handful of strata a
 * chart actually draws — "White versus everyone else", "under 65 and over".
 * The agent owns resolving one into a spec (`udiagent.stratify`); this owns
 * editing one, so the shapes here mirror that module's JSON exactly and the
 * whole thing travels as a string in the template's `grouping` tool argument.
 *
 * Nothing here validates the way the agent does. A grouping is round-tripped
 * through `/v1/yac/vis_instantiate`, which validates it properly and answers
 * with prose; duplicating those rules would mean two places to keep in step
 * and a second, subtly different opinion about what is legal. What this does
 * enforce is what the *editor* needs to stay coherent — a value in one group at
 * a time, cut points in order — because those are invariants of the control
 * rather than of the payload.
 */

/** The most strata worth drawing; matches `MAX_GROUPS` in `udiagent.stratify`. */
export const MAX_GROUPS = 10;

export const DEFAULT_OTHER_LABEL = 'Other';

export interface NominalGroup {
  label: string;
  values: string[];
}

export interface NominalGrouping {
  type: 'nominal';
  groups: NominalGroup[];
  /** Label for values no group claims, or null to leave them out of the chart. */
  other: string | null;
}

export interface QuantitativeGrouping {
  type: 'quantitative';
  /** Ascending; N cuts make N+1 buckets, each half-open on the right. */
  cuts: number[];
}

export type Grouping = NominalGrouping | QuantitativeGrouping;

/**
 * Parse the grouping out of a tool argument.
 *
 * Returns null for every spelling of "not grouped" — and for anything
 * unrecognisable, deliberately. A control that refuses to render because the
 * stored payload is malformed strands the user with no way to fix it; falling
 * back to ungrouped leaves the editor usable and the chart unchanged.
 */
export function parseGrouping(raw: string | undefined | null): Grouping | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;

  if (Array.isArray(value.cuts)) {
    const cuts = value.cuts.filter((c): c is number => typeof c === 'number' && isFinite(c));
    return cuts.length > 0 ? { type: 'quantitative', cuts: [...cuts].sort((a, b) => a - b) } : null;
  }

  if (Array.isArray(value.groups)) {
    const groups: NominalGroup[] = [];
    for (const entry of value.groups) {
      if (!entry || typeof entry !== 'object') continue;
      const group = entry as Record<string, unknown>;
      const label = typeof group.label === 'string' ? group.label : '';
      const values = Array.isArray(group.values)
        ? group.values.filter((v): v is string => typeof v === 'string')
        : [];
      if (label && values.length > 0) groups.push({ label, values });
    }
    if (groups.length === 0) return null;
    const other = value.other;
    return {
      type: 'nominal',
      groups,
      other:
        typeof other === 'string' && other.trim()
          ? other.trim()
          : other === undefined
            ? DEFAULT_OTHER_LABEL
            : null,
    };
  }

  return null;
}

/** Serialize for the `grouping` tool argument; '' means ungrouped. */
export function serializeGrouping(grouping: Grouping | null): string {
  if (!grouping) return '';
  if (grouping.type === 'quantitative') {
    return JSON.stringify({ type: 'quantitative', cuts: grouping.cuts });
  }
  return JSON.stringify({
    type: 'nominal',
    groups: grouping.groups,
    other: grouping.other,
  });
}

/**
 * Bucket labels for a set of cut points — N cuts give N+1 labels.
 *
 * Must agree character-for-character with `quantitative_labels` in
 * `udiagent.stratify`: these are what the editor shows as the strata, and the
 * agent's are what the chart ends up drawing. Two spellings of the same bucket
 * would read as the control lying about the result.
 */
export function quantitativeLabels(cuts: number[]): string[] {
  if (cuts.length === 0) return [];
  // `String` already drops a trailing `.0`, so an integer cut reads "< 65"
  // rather than "< 65.0" — which is what the agent's labels do too.
  const labels = [`< ${cuts[0]}`];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    labels.push(`${cuts[i]}–${cuts[i + 1]}`);
  }
  labels.push(`≥ ${cuts[cuts.length - 1]}`);
  return labels;
}

/** Every stratum a grouping produces, in drawing order. */
export function groupingLabels(grouping: Grouping | null, fallback: string[] = []): string[] {
  if (!grouping) return fallback;
  if (grouping.type === 'quantitative') return quantitativeLabels(grouping.cuts);
  const labels = grouping.groups.map((g) => g.label);
  if (grouping.other !== null) labels.push(grouping.other);
  return labels;
}

/** The domain values no group has claimed — what would fall into Other. */
export function unassignedValues(grouping: NominalGrouping, domain: string[]): string[] {
  const claimed = new Set(grouping.groups.flatMap((g) => g.values));
  return domain.filter((v) => !claimed.has(v));
}

/**
 * Move one value into a group, taking it out of whichever group had it.
 *
 * Assignment is exclusive because overlapping groups are not a partition: the
 * agent refuses them, and a conditional cannot express a row being in two
 * strata at once. Passing a null target unassigns.
 */
export function assignValue(
  grouping: NominalGrouping,
  value: string,
  targetLabel: string | null,
): NominalGrouping {
  const groups = grouping.groups.map((group) => ({
    ...group,
    values:
      group.label === targetLabel
        ? group.values.includes(value)
          ? group.values
          : [...group.values, value]
        : group.values.filter((v) => v !== value),
  }));
  return { ...grouping, groups };
}

/** Rename a group, which renames the series it draws. */
export function renameGroup(
  grouping: NominalGrouping,
  index: number,
  label: string,
): NominalGrouping {
  const groups = grouping.groups.map((group, i) => (i === index ? { ...group, label } : group));
  return { ...grouping, groups };
}

/** A distinct default name for the next group, so two are never both "Group 2". */
export function nextGroupLabel(grouping: NominalGrouping): string {
  const taken = new Set(grouping.groups.map((g) => g.label));
  for (let i = 1; i <= MAX_GROUPS + 1; i += 1) {
    const candidate = `Group ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `Group ${grouping.groups.length + 1}`;
}

/**
 * Insert a cut point, keeping the list ascending and free of duplicates.
 *
 * Rounded to the precision the axis is worth reading at, so dragging a handle
 * cannot produce `64.99999999999999` — which the agent would accept and then
 * render in a bucket label.
 */
export function addCut(cuts: number[], value: number, precision = 4): number[] {
  const rounded = Number(value.toFixed(precision));
  if (cuts.some((c) => c === rounded)) return cuts;
  return [...cuts, rounded].sort((a, b) => a - b);
}

export function moveCut(cuts: number[], index: number, value: number, precision = 4): number[] {
  const next = [...cuts];
  next[index] = Number(value.toFixed(precision));
  return next.sort((a, b) => a - b);
}

export function removeCut(cuts: number[], index: number): number[] {
  return cuts.filter((_, i) => i !== index);
}

/** Cut points splitting [min, max] into `count` equally wide buckets. */
export function equalWidthCuts(min: number, max: number, count: number): number[] {
  if (count < 2 || !isFinite(min) || !isFinite(max) || max <= min) return [];
  const step = (max - min) / count;
  return Array.from({ length: count - 1 }, (_, i) => Number((min + step * (i + 1)).toFixed(4)));
}
