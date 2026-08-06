import { useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useInViewport } from '@/lib/useInViewport';
import type { Preview, ReviewStatus, TemplateRecord } from '@/types/previews';
import { ReviewControls } from './ReviewControls';
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
  /** Open this template in the full-screen modal. */
  onOpenLarge: () => void;
}

export function TemplateCard({
  template,
  preview,
  status,
  feedback,
  sourceResolver,
  onReview,
  onOpenLarge,
}: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  // Only mount the chart while this card is near the viewport. Everything else
  // on the card (metadata, review controls) is cheap and always rendered, so a
  // reviewer can read and act on an off-screen card without waiting for a chart.
  const previewRef = useRef<HTMLDivElement>(null);
  const previewVisible = useInViewport(previewRef);
  return (
    <article
      className={cn(
        'template-card flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm',
        status === 'approved' && 'border-emerald-300',
        status === 'rejected' && 'border-rose-300',
        status === 'needs_changes' && 'border-amber-300',
        status === 'new' && 'border-slate-200',
        // Archived templates stay reviewable but recede, so triaged output
        // doesn't compete for attention with what still needs a decision.
        status === 'archived' && 'border-slate-300 bg-slate-50 opacity-60 hover:opacity-100',
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

      {/* Fixed height whether or not the chart is mounted, so mounting and
          unmounting never shifts the page under the reviewer's scroll. */}
      <div ref={previewRef} className="h-64 shrink-0 p-2">
        {previewVisible ? (
          <TemplatePreview preview={preview} sourceResolver={sourceResolver} />
        ) : (
          <PreviewPlaceholder />
        )}
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
          onClick={onOpenLarge}
          title="Open full size — the grid squeezes wide tables and legends"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <Maximize2 className="size-3.5" /> Enlarge
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? 'Hide details' : 'Details'}
        </button>
      </div>

      <div className="border-t border-slate-100 px-3 py-2">
        <ReviewControls status={status} feedback={feedback} onReview={onReview} />
      </div>

      {expanded && <TemplateDetails template={template} preview={preview} />}
    </article>
  );
}

/**
 * Stand-in for a chart that hasn't been scrolled to yet.
 *
 * Deliberately neutral and wordless-but-labelled: it must never be mistakable
 * for "this template can't render", which is a review-relevant finding shown by
 * TemplatePreview's own empty states.
 */
function PreviewPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center rounded-md bg-slate-50">
      <span className="animate-pulse text-[10px] tracking-wide text-slate-400 uppercase">
        chart loads when scrolled into view
      </span>
    </div>
  );
}
