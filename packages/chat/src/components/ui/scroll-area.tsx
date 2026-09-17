import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';

import { cn } from '@/lib/utils';

type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

interface ScrollAreaProps extends ScrollAreaPrimitive.Root.Props {
  orientation?: ScrollAreaOrientation;
}

function ScrollArea({ className, children, orientation = 'vertical', ...props }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('udi:relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'udi:size-full udi:rounded-[inherit] udi:transition-[color,box-shadow] udi:outline-none udi:focus-visible:ring-[3px] udi:focus-visible:ring-ring/50 udi:focus-visible:outline-1',
          orientation === 'vertical' && 'udi:overflow-x-hidden!',
          orientation === 'horizontal' && 'udi:overflow-y-hidden!',
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
        className="udi:relative udi:flex-1 udi:rounded-full udi:bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
