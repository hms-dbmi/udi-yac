import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDashboard, useGlobal } from '@/app/UDIChatContext';
import { DashboardGrid } from './DashboardGrid';
import { ScrollAffordances } from './ScrollAffordances';
import { GridSettingsButton } from './GridSettingsButton';
import { WelcomeSplash } from './WelcomeSplash';
import { FilterToolbar } from './FilterToolbar';
import { useFilterChips } from '../hooks/useFilterChips';
import { useToolkitSelections } from '../hooks/useToolkitSelections';
import { DataCounts } from './DataCounts';
import { DownloadButton } from './DownloadButton';
import { DashboardMenu } from './DashboardMenu';
import { SessionImportExportButton } from './SessionImportExportButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/** How far the header has shrunk to fit its row: as designed, controls folded
 *  into `DashboardMenu`, then count chips on one line too. */
type HeaderFit = 'full' | 'folded' | 'compact';
const NEXT_FIT = { full: 'folded', folded: 'compact', compact: null } as const;

/** Counts, grid settings, session import/export and downloads. Not rendered in
 *  read-only: that view is usually a dashboard embedded in a host page, where
 *  the charts need the height more than the chrome does. When the counts would
 *  wrap beside the controls, the controls fold into one menu, and if the counts
 *  still don't fit beside that, the chips go compact. */
function DashboardHeader() {
  const rowRef = useRef<HTMLDivElement>(null);
  const countsRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // A fresh object on every resize, so a resize re-runs the check from 'full'
  // even when the header is already there.
  const [fit, setFit] = useState<{ step: HeaderFit }>({ step: 'full' });

  // Steps down one fit at a time while the counts don't fit on one line beside
  // the controls. Layout-effect updates render before paint, so only the step
  // that fits is ever seen.
  useLayoutEffect(() => {
    const next = NEXT_FIT[fit.step];
    if (!next) return;
    const row = rowRef.current!;
    const width = (el: Element) => el.getBoundingClientRect().width;
    const gap = (el: Element) => parseFloat(getComputedStyle(el).columnGap) || 0;
    // The chips keep their own width under flex-wrap, so this is the width of
    // one line of them whether or not they are wrapping now.
    const chipRow = countsRef.current!.firstElementChild;
    const chips = chipRow ? Array.from(chipRow.children) : [];
    const countsWidth =
      chips.reduce((sum, chip) => sum + width(chip), 0) +
      (chips.length > 1 ? gap(chipRow!) * (chips.length - 1) : 0);
    if (countsWidth + gap(row) + width(controlsRef.current!) > row.clientWidth) {
      setFit({ step: next });
    }
  }, [fit]);

  useLayoutEffect(() => {
    // ponytail: a chip that changes width without resizing the counts block
    // (squeezed, wrapping) isn't re-checked until the next resize; observe each
    // chip (with a seen-set, since re-observing re-fires) if that shows up.
    const observer = new ResizeObserver(() => setFit({ step: 'full' }));
    observer.observe(rowRef.current!);
    observer.observe(countsRef.current!);
    return () => observer.disconnect();
  }, []);

  const folded = fit.step !== 'full';
  return (
    <div
      ref={rowRef}
      className={cn(
        'udi:flex udi:justify-between udi:gap-2 udi:shrink-0',
        folded ? 'udi:items-start' : 'udi:items-center',
      )}
    >
      <div ref={countsRef}>
        <DataCounts compact={fit.step === 'compact'} />
      </div>
      <div ref={controlsRef} className="udi:flex udi:items-center udi:gap-1.5 udi:shrink-0">
        {folded ? (
          <DashboardMenu />
        ) : (
          <>
            <GridSettingsButton />
            <SessionImportExportButton />
            <DownloadButton />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * @param seeding An `initialSession` is waiting on the data package. The
 *   dashboard is not empty then, only not filled yet, so it shows a spinner
 *   rather than the welcome splash, whose mascot would otherwise flash up for
 *   the length of the load.
 */
export function DashboardPanel({ seeding = false }: { seeding?: boolean }) {
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const toolkitSelections = useToolkitSelections();
  const readOnly = useGlobal((s) => s.readOnly);
  // Read-only has no header, so the sticky band holds only the Filters section;
  // with nothing filtered it would be an empty white strip.
  const hasFilters = useFilterChips().length > 0;
  const showBand = !readOnly || hasFilters;

  // Sticky-on-scroll: the header + filter row + separator stay pinned to
  // the top of the scroll viewport while the grid scrolls underneath. An
  // IntersectionObserver watches a zero-height sentinel placed just
  // above the sticky band; once the sentinel scrolls out of the
  // viewport, the band is "stuck" and we drop a subtle shadow beneath
  // it. Root is the ScrollArea viewport (Base UI's primitive emits
  // `data-slot="scroll-area-viewport"`) so the observer measures
  // against the right scroller, not the window. Declared up here ahead
  // of the empty-state early-return so the hook order stays stable.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = el.closest('[data-slot="scroll-area-viewport"]');
    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      root,
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasEntries = activeVisualizations.size > 0;

  // No entries → skip the ScrollArea. A consumer-provided tall mascot (or
  // long custom splash messages) would otherwise make the inner content
  // exceed the viewport and turn the whole panel scrollable; clip to the
  // container instead and give WelcomeSplash a real parent height so its
  // `h-full` anchors correctly.
  if (!hasEntries) {
    return (
      <div className="udi:h-full udi:p-3 udi:overflow-hidden">
        <div className="udi:flex udi:flex-col udi:gap-3">
          {!readOnly && <DashboardHeader />}
          <div className="udi:min-h-0 udi:flex-1">
            {seeding ? (
              <div role="status" className="udi:flex udi:justify-center udi:py-12">
                <Loader2
                  aria-hidden
                  className="udi:h-5 udi:w-5 udi:animate-spin udi:text-muted-foreground"
                />
                <span className="udi:sr-only">Loading dashboard</span>
              </div>
            ) : (
              <WelcomeSplash />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollWrapperRef} className="udi:relative udi:h-full">
      {/* Gray panel background lives on the ScrollArea so it paints behind the
          transparent viewport and fills the bottom gutter (pb-3). The left +
          right gutters are applied to the grid alone (below), not the
          ScrollArea, so the white header band and Separator span the full panel
          width instead of being cut short by the insets, while the gray
          background still shows through the grid's side gutters. Header +
          filters use px-3 to match the grid's inset. Top spacing lives on the
          sticky band (pt-3) so no gray strip lands above it. */}
      <ScrollArea className="udi:h-full udi:bg-udi-gray-100 udi:pb-3">
        <div className="udi:flex udi:flex-col">
          <div ref={sentinelRef} aria-hidden />
          {/* No pb here: the Separator is the band's bottom edge so the stuck
              shadow casts straight onto the gray grid instead of a white chin. */}
          {showBand && (
            <div
              // Marks the band as overlaying the scrolled content, so a jumped-to
              // card lands below it instead of underneath (scrollIntoViewport).
              data-scroll-sticky-top
              className={cn(
                'udi:sticky udi:top-0 udi:z-10 udi:flex udi:flex-col udi:gap-3 udi:bg-background udi:pt-3 udi:transition-shadow',
                isStuck && 'udi:shadow-md',
              )}
            >
              {!readOnly && (
                <div className="udi:px-3">
                  <DashboardHeader />
                </div>
              )}
              <FilterToolbar />
              <Separator />
            </div>
          )}
          {/* Left + right gutter on the grid alone so the header band above
              stays full-width. The gray ScrollArea background paints behind
              these gutters, so the grid insets from both panel edges while the
              dashboard background still spans the full width. */}
          <div className="udi:px-3">
            <DashboardGrid selections={toolkitSelections} />
          </div>
        </div>
      </ScrollArea>
      <ScrollAffordances containerRef={scrollWrapperRef} />
    </div>
  );
}
