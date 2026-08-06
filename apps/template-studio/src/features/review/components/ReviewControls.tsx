import { useState, type ReactNode } from 'react';
import { Archive, Check, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReviewStatus } from '@/types/previews';

export interface ReviewControlsProps {
  status: ReviewStatus;
  /** The persisted feedback; the draft resets when this changes. */
  feedback: string;
  /** Absent when the write endpoint isn't available (a static build). */
  onReview: ((status: ReviewStatus, feedback: string) => Promise<void>) | null;
  /** Larger text and taller textarea for the modal. */
  size?: 'compact' | 'roomy';
}

/**
 * The feedback box and status buttons.
 *
 * Shared by the grid card and the expanded modal so the two can't drift — a
 * reviewer must get the same set of actions wherever they act.
 */
export function ReviewControls({
  status,
  feedback,
  onReview,
  size = 'compact',
}: ReviewControlsProps) {
  const [draft, setDraft] = useState(feedback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render is React's recommended response to a changed
  // prop; an effect here would cause the documented cascading-render problem.
  const [lastFeedback, setLastFeedback] = useState(feedback);
  if (lastFeedback !== feedback) {
    setLastFeedback(feedback);
    setDraft(feedback);
  }

  const dirty = draft !== feedback;
  const roomy = size === 'roomy';

  async function submit(next: ReviewStatus) {
    if (!onReview) return;
    setSaving(true);
    setError(null);
    try {
      await onReview(next, draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={!onReview}
        rows={roomy ? 3 : 2}
        placeholder={onReview ? 'Feedback for the template author…' : 'Read-only build'}
        className={cn(
          'w-full resize-y rounded border border-slate-200 px-2 py-1 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 disabled:bg-slate-50',
          roomy ? 'text-sm' : 'text-xs',
        )}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <ReviewButton
          onClick={() => submit('approved')}
          disabled={!onReview || saving}
          active={status === 'approved'}
          roomy={roomy}
          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 aria-pressed:bg-emerald-600"
        >
          <Check className="size-3.5" /> Approve
        </ReviewButton>

        <ReviewButton
          onClick={() => submit('needs_changes')}
          disabled={!onReview || saving}
          active={status === 'needs_changes'}
          roomy={roomy}
          className="border-amber-300 text-amber-800 hover:bg-amber-50 aria-pressed:bg-amber-600"
        >
          <RotateCcw className="size-3.5" /> Needs changes
        </ReviewButton>

        <ReviewButton
          onClick={() => submit('rejected')}
          disabled={!onReview || saving}
          active={status === 'rejected'}
          roomy={roomy}
          className="border-rose-300 text-rose-700 hover:bg-rose-50 aria-pressed:bg-rose-600"
        >
          <X className="size-3.5" /> Reject
        </ReviewButton>

        {/* Archive is not a rejection: the template is correct, we just don't want
            the agent offering it any more. Kept visually neutral so it doesn't
            read as a verdict on quality. */}
        <ReviewButton
          onClick={() => submit('archived')}
          disabled={!onReview || saving}
          active={status === 'archived'}
          roomy={roomy}
          title="Valid, but should no longer be offered as agent output"
          className="border-slate-300 text-slate-700 hover:bg-slate-100 aria-pressed:bg-slate-600"
        >
          <Archive className="size-3.5" /> Archive
        </ReviewButton>

        {dirty && onReview && (
          <span className="text-[10px] text-slate-500">
            unsaved feedback — pick a status to save
          </span>
        )}
        {saving && <span className="text-[10px] text-slate-500">saving…</span>}
        {error && <span className="text-[10px] text-rose-600">{error}</span>}
      </div>
    </div>
  );
}

function ReviewButton({
  onClick,
  disabled,
  active,
  className,
  title,
  roomy,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  className?: string;
  title?: string;
  roomy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'aria-pressed:border-transparent aria-pressed:text-white',
        roomy ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs',
        className,
      )}
    >
      {children}
    </button>
  );
}
