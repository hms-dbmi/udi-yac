import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Preview, ReviewStatus, TemplateRecord } from '@/types/previews';
import { StatusBadge } from './StatusBadge';
import { TemplateDetails } from './TemplateDetails';
import { TemplatePreview } from './TemplatePreview';

export interface TemplateCardProps {
  template: TemplateRecord;
  preview: Preview | undefined;
  status: ReviewStatus;
  feedback: string;
  sourceResolver: Record<string, string>;
  /** Absent when the write endpoint isn't available (static build). */
  onReview: ((status: ReviewStatus, feedback: string) => Promise<void>) | null;
}

export function TemplateCard({
  template,
  preview,
  status,
  feedback,
  sourceResolver,
  onReview,
}: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(feedback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft when the persisted feedback changes underneath us (e.g. a
  // reload, or a save completing). Adjusting state during render is React's
  // recommended way to react to a changed prop — an effect here would cause the
  // documented cascading-render problem.
  const [lastFeedback, setLastFeedback] = useState(feedback);
  if (lastFeedback !== feedback) {
    setLastFeedback(feedback);
    setDraft(feedback);
  }

  const dirty = draft !== feedback;

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
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm',
        status === 'approved' && 'border-emerald-300',
        status === 'rejected' && 'border-rose-300',
        status === 'needs_changes' && 'border-amber-300',
        status === 'new' && 'border-slate-200',
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-xs font-semibold text-slate-800">
            {template.toolName ?? `template #${template.index}`}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{template.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {template.templateGrammarError && (
            <span
              title={`Template fails grammar validation: ${template.templateGrammarError}`}
              className="text-amber-600"
            >
              <AlertTriangle className="size-4" />
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </header>

      <div className="h-64 shrink-0 p-2">
        <TemplatePreview preview={preview} sourceResolver={sourceResolver} />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 px-3 py-2">
        {template.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
          >
            {tag}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? 'Hide details' : 'Details'}
        </button>
      </div>

      <div className="space-y-2 border-t border-slate-100 px-3 py-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!onReview}
          rows={2}
          placeholder={onReview ? 'Feedback for the template author…' : 'Read-only build'}
          className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 disabled:bg-slate-50"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <ReviewButton
            onClick={() => submit('approved')}
            disabled={!onReview || saving}
            active={status === 'approved'}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 aria-pressed:bg-emerald-600"
          >
            <Check className="size-3.5" /> Approve
          </ReviewButton>

          <ReviewButton
            onClick={() => submit('needs_changes')}
            disabled={!onReview || saving}
            active={status === 'needs_changes'}
            className="border-amber-300 text-amber-800 hover:bg-amber-50 aria-pressed:bg-amber-600"
          >
            <RotateCcw className="size-3.5" /> Needs changes
          </ReviewButton>

          <ReviewButton
            onClick={() => submit('rejected')}
            disabled={!onReview || saving}
            active={status === 'rejected'}
            className="border-rose-300 text-rose-700 hover:bg-rose-50 aria-pressed:bg-rose-600"
          >
            <X className="size-3.5" /> Reject
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

      {expanded && <TemplateDetails template={template} preview={preview} />}
    </article>
  );
}

function ReviewButton({
  onClick,
  disabled,
  active,
  className,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'aria-pressed:border-transparent aria-pressed:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}
