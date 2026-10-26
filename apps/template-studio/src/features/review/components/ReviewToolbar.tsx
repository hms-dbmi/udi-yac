import { cn } from '@/lib/cn';
import {
  REVIEW_STATUSES,
  STATUS_LABELS,
  type DataPackageInfo,
  type ReviewStatus,
} from '@/types/previews';
import type { ReviewCounts } from '@/lib/reviews';

export interface ReviewToolbarProps {
  dataPackages: DataPackageInfo[];
  selectedPackageId: string;
  onSelectPackage: (id: string) => void;
  statuses: Set<ReviewStatus>;
  onToggleStatus: (status: ReviewStatus) => void;
  search: string;
  onSearch: (value: string) => void;
  renderableOnly: boolean;
  onToggleRenderableOnly: (value: boolean) => void;
  counts: ReviewCounts;
  shown: number;
}

export function ReviewToolbar({
  dataPackages,
  selectedPackageId,
  onSelectPackage,
  statuses,
  onToggleStatus,
  search,
  onSearch,
  renderableOnly,
  onToggleRenderableOnly,
  counts,
  shown,
}: ReviewToolbarProps) {
  const selected = dataPackages.find((p) => p.id === selectedPackageId);

  return (
    <div className="space-y-2 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          Data package
          <select
            value={selectedPackageId}
            onChange={(event) => onSelectPackage(event.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-800"
          >
            {dataPackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.id}
                {pkg.isCube ? ' (cube)' : ''}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <span className="text-xs text-slate-500">
            selects{' '}
            <span className="font-mono text-slate-700">{selected.activeTags.join(', ')}</span>{' '}
            templates
          </span>
        )}

        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Filter by name, description, chart type, tag…"
          className="min-w-56 flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
        />

        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={renderableOnly}
            onChange={(event) => onToggleRenderableOnly(event.target.checked)}
          />
          Renderable only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600">Status</span>
        {REVIEW_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statuses.has(status)}
            onClick={() => onToggleStatus(status)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs transition-colors',
              statuses.has(status)
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {STATUS_LABELS[status]} ({counts[status]})
          </button>
        ))}

        <span className="ml-auto text-xs text-slate-500">
          showing {shown} of {counts.total}
        </span>
      </div>
    </div>
  );
}
