import { cn } from '@/lib/cn';
import { STATUS_LABELS, type ReviewStatus } from '@/types/previews';

const STYLES: Record<ReviewStatus, string> = {
  new: 'bg-sky-100 text-sky-800 ring-sky-300',
  approved: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 ring-rose-300',
  needs_changes: 'bg-amber-100 text-amber-900 ring-amber-300',
};

export function StatusBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
