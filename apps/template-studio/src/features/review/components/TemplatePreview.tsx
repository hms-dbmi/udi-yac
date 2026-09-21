import { UDIVis } from 'udi-toolkit/react';
import { AlertTriangle, Ban, Shapes } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { Preview } from '@/types/previews';

/**
 * The live visualization for one template, or an explanation of why there
 * isn't one.
 *
 * A template that can't render against the selected package is shown as an
 * explicit, labelled state — never a blank or silently-broken chart, which
 * would read as "this template is fine" during review.
 */
export function TemplatePreview({
  preview,
  sourceResolver,
}: {
  preview: Preview | undefined;
  sourceResolver: Record<string, string>;
}) {
  // The Vue custom element mutates what it's given, so hand it an inert deep
  // clone (same reason chat's DashboardCard does this).
  const spec = useMemo(
    () => (preview?.status === 'ok' ? JSON.parse(JSON.stringify(preview.spec)) : null),
    [preview],
  );

  // Force a remount when the spec content changes: the CE doesn't reliably
  // re-render on prop updates alone.
  const specKey = useMemo(() => (spec ? JSON.stringify(spec) : ''), [spec]);

  if (!preview) {
    return (
      <EmptyState
        icon={<Ban className="size-5" />}
        title="No preview generated"
        detail="This template wasn't included in the export. Re-run the preview exporter."
      />
    );
  }

  if (preview.status === 'shape_mismatch') {
    return (
      <EmptyState
        icon={<Shapes className="size-5" />}
        title="Not applicable to this data package"
        detail={preview.reason}
        tone="muted"
      />
    );
  }

  if (preview.status === 'unsupported') {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-5" />}
        title="Can't bind to this data package"
        detail={preview.reason}
        tone="warning"
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {preview.grammarError && (
        <p className="mb-1 flex items-start gap-1 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Renders, but the resolved spec fails grammar validation:{' '}
            <span className="font-mono">{preview.grammarError}</span>
          </span>
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <UDIVis key={specKey} spec={spec} sourceResolver={sourceResolver} fillContainer />
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  tone = 'warning',
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone?: 'warning' | 'muted';
}) {
  const toneClasses =
    tone === 'muted'
      ? 'border-slate-200 bg-slate-50 text-slate-500'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center ${toneClasses}`}
    >
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-prose text-xs opacity-80">{detail}</p>
    </div>
  );
}
