/**
 * Review-state reconciliation and persistence.
 *
 * Review state is keyed by a hash of the template's spec, not by the generated
 * tool name: `_derive_tool_name` embeds the template's positional index and is
 * derived from its mutable description, so it renames whenever templates are
 * inserted, reordered, or re-described. Hashing the spec means a review stays
 * attached to the exact spec that was reviewed, and deliberately orphans when
 * that spec changes — which is the signal a reviewer wants, not a bug.
 */
import {
  REVIEW_STATUSES,
  type ReviewEntry,
  type ReviewMap,
  type ReviewStatus,
  type TemplateRecord,
} from '@/types/previews';

/** A stored review whose template no longer exists in the current export. */
export interface OrphanedReview {
  key: string;
  entry: ReviewEntry;
}

/** Templates default to `new` — absence of an entry is not an error. */
export function statusFor(key: string, reviews: ReviewMap): ReviewStatus {
  return reviews[key]?.status ?? 'new';
}

export function feedbackFor(key: string, reviews: ReviewMap): string {
  return reviews[key]?.feedback ?? '';
}

/**
 * Review entries with no matching template.
 *
 * Surfaced rather than dropped: an orphan usually means a template was edited
 * (so its hash moved) and the old feedback may still be worth acting on.
 */
export function findOrphanedReviews(
  templates: TemplateRecord[],
  reviews: ReviewMap,
): OrphanedReview[] {
  const live = new Set(templates.map((t) => t.key));
  return Object.entries(reviews)
    .filter(([key]) => !live.has(key))
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type ReviewCounts = Record<ReviewStatus, number> & { total: number };

export function countByStatus(templates: TemplateRecord[], reviews: ReviewMap): ReviewCounts {
  const counts = { total: templates.length } as ReviewCounts;
  for (const status of REVIEW_STATUSES) counts[status] = 0;
  for (const template of templates) counts[statusFor(template.key, reviews)] += 1;
  return counts;
}

export interface FilterOptions {
  /** Empty set means "no status filter". */
  statuses: Set<ReviewStatus>;
  /** Free-text match across name, description, chart type and tags. */
  search: string;
  /** Hide templates that can't render against the selected data package. */
  renderableOnly: boolean;
  /** The data package whose preview status `renderableOnly` checks. */
  dataPackageId: string | null;
}

export function filterTemplates(
  templates: TemplateRecord[],
  reviews: ReviewMap,
  options: FilterOptions,
): TemplateRecord[] {
  const needle = options.search.trim().toLowerCase();

  return templates.filter((template) => {
    if (options.statuses.size > 0 && !options.statuses.has(statusFor(template.key, reviews))) {
      return false;
    }

    if (options.renderableOnly && options.dataPackageId) {
      if (template.previews[options.dataPackageId]?.status !== 'ok') return false;
    }

    if (needle) {
      const haystack = [
        template.toolName ?? '',
        template.description,
        template.chartType ?? '',
        template.tags.join(' '),
        template.queryTemplates.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Persistence — talks to the Vite dev-server middleware in
// vite-plugin-review-store.ts. A production build has no such endpoint, which
// is why callers must handle `available: false`.
// ---------------------------------------------------------------------------

const API = '/api/reviews';

export interface LoadedReviews {
  reviews: ReviewMap;
  /** False when the write endpoint isn't there (i.e. a static build). */
  available: boolean;
  /** Absolute path of the sidecar, shown in the UI so reviewers can find it. */
  path?: string;
}

export async function loadReviews(): Promise<LoadedReviews> {
  try {
    const response = await fetch(API);
    if (!response.ok) return { reviews: {}, available: false };
    const body = (await response.json()) as { reviews?: ReviewMap; path?: string };
    return { reviews: body.reviews ?? {}, available: true, path: body.path };
  } catch {
    return { reviews: {}, available: false };
  }
}

export async function saveReview(
  key: string,
  entry: Pick<ReviewEntry, 'status' | 'feedback'> & { tool_name?: string; chart_type?: string },
): Promise<ReviewEntry> {
  const response = await fetch(`${API}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`failed to save review (${response.status}): ${detail}`);
  }
  const body = (await response.json()) as { entry: ReviewEntry };
  return body.entry;
}

export async function deleteReview(key: string): Promise<void> {
  const response = await fetch(`${API}/${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`failed to delete review (${response.status})`);
}
