import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Preview, ReviewStatus, TemplateRecord } from '@/types/previews';
import { ReviewControls } from './ReviewControls';
import { StatusBadge } from './StatusBadge';
import { TemplateDetails } from './TemplateDetails';
import { TemplatePreview } from './TemplatePreview';

export interface TemplateModalProps {
  template: TemplateRecord;
  preview: Preview | undefined;
  status: ReviewStatus;
  feedback: string;
  sourceResolver: Record<string, string>;
  onReview: ((status: ReviewStatus, feedback: string) => Promise<void>) | null;
  onClose: () => void;
}

/**
 * One template at near-full-screen size.
 *
 * The grid deliberately keeps cards small so many templates are comparable at a
 * glance, which squeezes anything detailed — wide tables, heatmaps, charts with
 * legends. This is the "look properly at this one" view, with the same review
 * actions so a decision can be made without going back.
 *
 * Built on <dialog> so focus trapping, Esc-to-close and the backdrop come from
 * the platform rather than from hand-rolled key handlers.
 */
export function TemplateModal({
  template,
  preview,
  status,
  feedback,
  sourceResolver,
  onReview,
  onClose,
}: TemplateModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    // `close` fires for Esc as well as for our own close button, so this is the
    // single place that has to tell the parent the modal is gone.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      // Clicking the backdrop (the dialog element itself, outside the panel)
      // closes; clicks inside the panel stop at its own handler.
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-0 h-screen max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-slate-900/50"
      aria-label={`Template ${template.toolName ?? template.index}`}
    >
      <div className="flex h-full w-full items-center justify-center p-4">
        <div
          onClick={(event) => event.stopPropagation()}
          className="flex h-[92vh] w-[94vw] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold text-slate-900">
                  {template.toolName ?? `template #${template.index}`}
                </h2>
                <StatusBadge status={status} />
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-600">{template.description}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              title="Close (Esc)"
              className="shrink-0 rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="size-4" />
            </button>
          </header>

          {/* The point of the modal: give the visualization the space the grid
              can't. It takes the remaining height, with the details panel
              scrolling beneath it. */}
          <div className="min-h-0 flex-[3] border-b border-slate-100 p-3">
            <TemplatePreview preview={preview} sourceResolver={sourceResolver} />
          </div>

          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <ReviewControls status={status} feedback={feedback} onReview={onReview} size="roomy" />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <TemplateDetails template={template} preview={preview} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
