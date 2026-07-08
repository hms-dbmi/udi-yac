import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ScrollAffordancesProps {
  /** A `relative` ancestor that contains the ScrollArea. The scroll viewport
   *  (Base UI's `data-slot="scroll-area-viewport"`) is found within it. */
  containerRef: RefObject<HTMLDivElement | null>;
}

const buttonClass =
  'cursor-pointer rounded-full bg-background/90 shadow-sm backdrop-blur-sm hover:bg-muted';

/**
 * Up/down scroll buttons pinned to the bottom-right of a ScrollArea. Both are
 * always rendered (so nothing shifts as you scroll); each is disabled when
 * there's no room to scroll that way, signalling where more content lives.
 * Clicking scrolls by most of a page. Rendered as an overlay sibling of the
 * ScrollArea (not inside the scrolling content) so it stays pinned.
 */
export function ScrollAffordances({ containerRef }: ScrollAffordancesProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = container?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    viewportRef.current = viewport;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      setCanUp(scrollTop > 1);
      setCanDown(Math.ceil(scrollTop + clientHeight) < scrollHeight - 1);
    };
    update();

    viewport.addEventListener('scroll', update, { passive: true });
    // Content height changes as visualizations render/resize and as the panel
    // resizes — observe both the viewport and its content so the disabled state
    // tracks whether scrolling is still possible.
    const ro = new ResizeObserver(update);
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [containerRef]);

  const scrollByPage = (dir: 1 | -1) => {
    const v = viewportRef.current;
    if (v) v.scrollBy({ top: dir * v.clientHeight * 0.85, behavior: 'smooth' });
  };

  return (
    <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!canUp}
              aria-label="Scroll up"
              onClick={() => scrollByPage(-1)}
              className={buttonClass}
            />
          }
        >
          <ChevronUp className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Scroll up</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!canDown}
              aria-label="Scroll down"
              onClick={() => scrollByPage(1)}
              className={buttonClass}
            />
          }
        >
          <ChevronDown className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Scroll down</TooltipContent>
      </Tooltip>
    </div>
  );
}
