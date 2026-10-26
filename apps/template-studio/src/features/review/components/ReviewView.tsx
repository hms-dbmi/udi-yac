import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, FileWarning, Loader2, RefreshCw } from 'lucide-react';
import { loadStudioDataPackage } from '@/lib/dataPackage';
import {
  countByStatus,
  deleteReview,
  feedbackFor,
  filterTemplates,
  findOrphanedReviews,
  loadReviews,
  saveReview,
  statusFor,
} from '@/lib/reviews';
import type { PreviewsPayload, ReviewMap, ReviewStatus } from '@/types/previews';
import { OrphanedReviews } from './OrphanedReviews';
import { ReviewToolbar } from './ReviewToolbar';
import { TemplateCard } from './TemplateCard';
import { TemplateModal } from './TemplateModal';

const PREVIEWS_URL = '/template_previews.json';

export function ReviewView() {
  const [payload, setPayload] = useState<PreviewsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviews, setReviews] = useState<ReviewMap>({});
  const [writable, setWritable] = useState(false);
  const [reviewPath, setReviewPath] = useState<string | undefined>();

  const [packageId, setPackageId] = useState('');
  // One piece of state for the whole load, tagged with the package it belongs to.
  // Loading/error are then derived, so the effect never sets state synchronously.
  const [dataState, setDataState] = useState<{
    packageId: string;
    sourceResolver: Record<string, string>;
    error: string | null;
  } | null>(null);

  // Bumped by the retry button to re-run the data-package load effect.
  const [reloadToken, setReloadToken] = useState(0);
  // Key of the template shown full-screen, or null for none.
  const [enlargedKey, setEnlargedKey] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Set<ReviewStatus>>(new Set());
  const [search, setSearch] = useState('');
  const [renderableOnly, setRenderableOnly] = useState(true);
  const [stale, setStale] = useState(false);

  // Load the exported previews and the review sidecar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(PREVIEWS_URL);
        if (!response.ok) throw new Error(`${PREVIEWS_URL} returned ${response.status}`);
        const data = (await response.json()) as PreviewsPayload;
        if (cancelled) return;
        setPayload(data);
        setPackageId((current) => current || (data.dataPackages[0]?.id ?? ''));

        // Compare against the templates file on disk: if it moved since export,
        // what's on screen no longer reflects what would ship.
        try {
          const hashResponse = await fetch('/api/templates-hash');
          if (hashResponse.ok) {
            const { templatesHash } = (await hashResponse.json()) as { templatesHash: string };
            if (!cancelled && templatesHash && templatesHash !== data.templatesHash) setStale(true);
          }
        } catch {
          // No dev endpoint (static build) — staleness simply can't be checked.
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }

      const loaded = await loadReviews();
      if (cancelled) return;
      setReviews(loaded.reviews);
      setWritable(loaded.available);
      setReviewPath(loaded.path);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected package's tables into the shared toolkit store.
  const selectedPackage = payload?.dataPackages.find((p) => p.id === packageId);
  useEffect(() => {
    if (!selectedPackage) return;
    let cancelled = false;
    loadStudioDataPackage(selectedPackage.datapackageUrl)
      .then((result) => {
        if (!cancelled) {
          setDataState({
            packageId: selectedPackage.id,
            sourceResolver: result.sourceResolver,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDataState({
            packageId: selectedPackage.id,
            sourceResolver: {},
            error: (err as Error).message,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPackage, reloadToken]);

  // Anything not yet reported for the *current* package is still in flight.
  const dataReady = dataState?.packageId === packageId;
  const dataLoading = Boolean(selectedPackage) && !dataReady;
  const dataError = dataReady ? dataState.error : null;
  const sourceResolver = dataReady ? dataState.sourceResolver : {};

  const templates = useMemo(() => payload?.templates ?? [], [payload]);
  // Looked up from the live list rather than held as an object, so the modal
  // follows a re-export instead of pinning a stale copy of the template.
  const enlarged = enlargedKey ? templates.find((t) => t.key === enlargedKey) : undefined;
  const counts = useMemo(() => countByStatus(templates, reviews), [templates, reviews]);
  const orphans = useMemo(() => findOrphanedReviews(templates, reviews), [templates, reviews]);
  const visible = useMemo(
    () =>
      filterTemplates(templates, reviews, {
        statuses,
        search,
        renderableOnly,
        dataPackageId: packageId || null,
      }),
    [templates, reviews, statuses, search, renderableOnly, packageId],
  );

  function toggleStatus(status: ReviewStatus) {
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const onReview = writable
    ? async (key: string, status: ReviewStatus, feedback: string) => {
        const template = templates.find((t) => t.key === key);
        const entry = await saveReview(key, {
          status,
          feedback,
          tool_name: template?.toolName ?? undefined,
          chart_type: template?.chartType ?? undefined,
        });
        setReviews((current) => ({ ...current, [key]: entry }));
      }
    : null;

  const onDeleteOrphan = writable
    ? async (key: string) => {
        await deleteReview(key);
        setReviews((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    : null;

  if (loadError) {
    return (
      <Notice icon={<FileWarning className="size-5" />} title="No template previews found">
        <p>
          <span className="font-mono">{loadError}</span>
        </p>
        <p className="mt-2">Generate them with:</p>
        <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
          <code>pnpm --filter udi-template-studio sync-previews</code>
        </pre>
        <p className="mt-2 text-xs">
          This runs the agent&apos;s Python exporter, so it needs{' '}
          <span className="font-mono">uv</span> on PATH.
        </p>
      </Notice>
    );
  }

  if (!payload) {
    return (
      <Notice icon={<Loader2 className="size-5 animate-spin" />} title="Loading templates…">
        <p className="text-xs">Reading {PREVIEWS_URL}</p>
      </Notice>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-base font-semibold text-slate-900">UDI Template Studio</h1>
          <p className="text-xs text-slate-500">
            Reviewing {payload.templateCount} visualization templates from the YAC agent.
          </p>
          {!writable && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
              read-only — run via <span className="font-mono">pnpm dev</span> to save reviews
            </span>
          )}
        </div>
        {reviewPath && (
          <p className="mt-0.5 truncate text-[10px] text-slate-400">reviews → {reviewPath}</p>
        )}
      </header>

      <ReviewToolbar
        dataPackages={payload.dataPackages}
        selectedPackageId={packageId}
        onSelectPackage={setPackageId}
        statuses={statuses}
        onToggleStatus={toggleStatus}
        search={search}
        onSearch={setSearch}
        renderableOnly={renderableOnly}
        onToggleRenderableOnly={setRenderableOnly}
        counts={counts}
        shown={visible.length}
      />

      {stale && (
        <p className="mx-4 mt-3 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            These previews are stale —{' '}
            <span className="font-mono">template_visualizations.json</span> has changed since they
            were exported. Re-run{' '}
            <span className="font-mono">pnpm --filter udi-template-studio sync-previews</span>{' '}
            before reviewing.
          </span>
        </p>
      )}

      {dataError && (
        <div className="mx-4 mt-3 flex flex-wrap items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-40 flex-1">
            Could not load the <span className="font-mono">{packageId}</span> data package.{' '}
            {dataError}
          </span>
          <button
            type="button"
            onClick={() => {
              // Drop the failed result so the loading state shows again.
              setDataState(null);
              setReloadToken((n) => n + 1);
            }}
            className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 font-medium text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      )}

      <OrphanedReviews orphans={orphans} onDelete={onDeleteOrphan} />

      {dataLoading && (
        <p className="mx-4 mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" /> Loading {packageId} tables…
        </p>
      )}

      <main className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((template) => (
          <TemplateCard
            key={template.key}
            template={template}
            preview={template.previews[packageId]}
            status={statusFor(template.key, reviews)}
            feedback={feedbackFor(template.key, reviews)}
            sourceResolver={sourceResolver}
            onReview={
              onReview ? (status, feedback) => onReview(template.key, status, feedback) : null
            }
            onOpenLarge={() => setEnlargedKey(template.key)}
          />
        ))}
      </main>

      {visible.length === 0 && (
        <p className="px-4 pb-8 text-sm text-slate-500">No templates match the current filters.</p>
      )}

      {enlarged && (
        <TemplateModal
          // Remount on a different template so <dialog> and the chart start clean.
          key={enlarged.key}
          template={enlarged}
          preview={enlarged.previews[packageId]}
          status={statusFor(enlarged.key, reviews)}
          feedback={feedbackFor(enlarged.key, reviews)}
          sourceResolver={sourceResolver}
          onReview={
            onReview ? (status, feedback) => onReview(enlarged.key, status, feedback) : null
          }
          onClose={() => setEnlargedKey(null)}
        />
      )}
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          {icon}
          {title}
        </h1>
        <div className="mt-2 text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}
