'use client';

import { forwardRef } from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';
import { useChatRoot } from '@/lib/chatRoot';

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

// See note in components/ui/button.tsx — forwardRef is required so Base UI's
// render-prop composition (e.g. `<TooltipTrigger render={<Button ... />}>`)
// can attach a ref to this component on React 18.
const TooltipTrigger = forwardRef<HTMLButtonElement, TooltipPrimitive.Trigger.Props>(
  function TooltipTrigger(props, ref) {
    return <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />;
  },
);

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  const container = useChatRoot();
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="udi:isolate udi:z-1500"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'udi:z-1500 udi:inline-flex udi:w-fit udi:max-w-xs udi:origin-(--transform-origin) udi:items-center udi:gap-1.5 udi:rounded-md udi:bg-foreground udi:px-3 udi:py-1.5 udi:text-xs udi:text-background udi:has-data-[slot=kbd]:pr-1.5 udi:data-[side=bottom]:slide-in-from-top-2 udi:data-[side=inline-end]:slide-in-from-left-2 udi:data-[side=inline-start]:slide-in-from-right-2 udi:data-[side=left]:slide-in-from-right-2 udi:data-[side=right]:slide-in-from-left-2 udi:data-[side=top]:slide-in-from-bottom-2 udi:**:data-[slot=kbd]:relative udi:**:data-[slot=kbd]:isolate udi:**:data-[slot=kbd]:z-1500 udi:**:data-[slot=kbd]:rounded-sm udi:data-[state=delayed-open]:animate-in udi:data-[state=delayed-open]:fade-in-0 udi:data-[state=delayed-open]:zoom-in-95 udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-open:zoom-in-95 udi:data-closed:animate-out udi:data-closed:fade-out-0 udi:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="udi:z-1500 udi:size-2.5 udi:translate-y-[calc(-50%-2px)] udi:rotate-45 udi:rounded-[2px] udi:bg-foreground udi:fill-foreground udi:data-[side=bottom]:top-1 udi:data-[side=inline-end]:top-1/2! udi:data-[side=inline-end]:-left-1 udi:data-[side=inline-end]:-translate-y-1/2 udi:data-[side=inline-start]:top-1/2! udi:data-[side=inline-start]:-right-1 udi:data-[side=inline-start]:-translate-y-1/2 udi:data-[side=left]:top-1/2! udi:data-[side=left]:-right-1 udi:data-[side=left]:-translate-y-1/2 udi:data-[side=right]:top-1/2! udi:data-[side=right]:-left-1 udi:data-[side=right]:-translate-y-1/2 udi:data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
