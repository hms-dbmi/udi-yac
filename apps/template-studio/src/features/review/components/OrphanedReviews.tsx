import { Trash2, Unlink } from 'lucide-react';
import type { OrphanedReview } from '@/lib/reviews';
import { StatusBadge } from './StatusBadge';

/**
 * Review entries whose template no longer exists.
 *
 * These are surfaced rather than silently dropped: since review keys are spec
 * hashes, an orphan almost always means the template was edited — so the old
 * feedback is exactly what the author needs to see before re-reviewing.
 */
export function OrphanedReviews({
  orphans,
  onDelete,
}: {
  orphans: OrphanedReview[];
  onDelete: ((key: string) => Promise<void>) | null;
}) {
  if (orphans.length === 0) return null;

  return (
    <section className="mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <Unlink className="size-4" />
        {orphans.length} orphaned review {orphans.length === 1 ? 'entry' : 'entries'}
      </h2>
      <p className="mt-1 text-xs text-amber-800">
        These reviews reference templates that are no longer in the export — most likely the
        template&apos;s spec was edited, which changes its hash. Carry the feedback over to the new
        entry, then delete these.
      </p>

      <ul className="mt-2 space-y-1.5">
        {orphans.map(({ key, entry }) => (
          <li
            key={key}
            className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-white px-2 py-1.5 text-xs"
          >
            <span className="font-mono text-slate-700">{key}</span>
            <StatusBadge status={entry.status} />
            {entry.tool_name && (
              <span className="font-mono text-slate-500">was: {entry.tool_name}</span>
            )}
            {entry.feedback && (
              <span className="min-w-40 flex-1 text-slate-700 italic">“{entry.feedback}”</span>
            )}
            <span className="text-slate-400">{entry.reviewed_at.slice(0, 10)}</span>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(key)}
                title="Delete this orphaned review entry"
                className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="size-3" /> Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
