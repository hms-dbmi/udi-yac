import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';

import { cn } from '@/lib/utils';

type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

interface ScrollAreaProps extends ScrollAreaPrimitive.Root.Props {
  orientation?: ScrollAreaOrientation;
  /**
   * Classes for the scrolling element. A height cap goes here, not on the
   * root: the viewport is `size-full`, and a percentage height against a root
   * that only has a `max-height` resolves to auto, so the list never scrolls.
   */
  viewportClassName?: string;
  /**
   * Shade the top/bottom edge while content is clipped past it, so a list that
   * scrolls says so before anyone tries. Vertical only. Base UI sets the
   * `data-overflow-y-*` attributes on the root, and drops them at each end.
   */
  scrollShadow?: boolean;
}

// The pseudo-elements sit on the root, over the viewport, and ignore the
// pointer so they never eat a click on the row underneath.
const SCROLL_SHADOW =
  'udi:before:pointer-events-none udi:before:absolute udi:before:inset-x-0 udi:before:top-0 udi:before:z-10 udi:before:h-3 udi:before:bg-linear-to-b udi:before:from-black/15 udi:before:to-transparent udi:before:opacity-0 udi:before:transition-opacity udi:data-overflow-y-start:before:opacity-100 udi:dark:before:from-black/50 ' +
  'udi:after:pointer-events-none udi:after:absolute udi:after:inset-x-0 udi:after:bottom-0 udi:after:z-10 udi:after:h-3 udi:after:bg-linear-to-t udi:after:from-black/15 udi:after:to-transparent udi:after:opacity-0 udi:after:transition-opacity udi:data-overflow-y-end:after:opacity-100 udi:dark:after:from-black/50';

function ScrollArea({
  className,
  children,
  orientation = 'vertical',
  viewportClassName,
  scrollShadow = false,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('udi:relative', scrollShadow && SCROLL_SHADOW, className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'udi:size-full udi:rounded-[inherit] udi:transition-[color,box-shadow] udi:outline-none udi:focus-visible:ring-[3px] udi:focus-visible:ring-ring/50 udi:focus-visible:outline-1',
          orientation === 'vertical' && 'udi:overflow-x-hidden!',
          orientation === 'horizontal' && 'udi:overflow-y-hidden!',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && (
        <ScrollBar orientation="vertical" />
      )}
      {(orientation === 'horizontal' || orientation === 'both') && (
        <ScrollBar orientation="horizontal" />
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'udi:flex udi:touch-none udi:p-px udi:transition-colors udi:select-none udi:data-horizontal:h-2.5 udi:data-horizontal:flex-col udi:data-horizontal:border-t udi:data-horizontal:border-t-transparent udi:data-vertical:h-full udi:data-vertical:w-2.5 udi:data-vertical:border-l udi:data-vertical:border-l-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="udi:relative udi:flex-1 udi:rounded-full udi:bg-(--udi-scrollbar-thumb) udi:hover:bg-(--udi-scrollbar-thumb-hover)"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
