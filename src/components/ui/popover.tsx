'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

// forwardRef so Base UI's `render={<Button ... />}` composition can attach
// a ref on React 18 (matches the pattern in dialog.tsx).
const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverPrimitive.Trigger.Props>(
  function PopoverTrigger(props, ref) {
    return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />;
  },
);

function PopoverContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props & {
  align?: PopoverPrimitive.Positioner.Props['align'];
  sideOffset?: PopoverPrimitive.Positioner.Props['sideOffset'];
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        // Positioner needs its own high z-index (matching dropdown-menu)
        // because the inner Popup's `z-1500` only orders things WITHIN the
        // Positioner's stacking context — without z on the Positioner the
        // whole popover renders at z-auto and ends up behind anything
        // positioned higher in its containing stack (e.g. the dashboard's
        // `z-10` sticky header).
        className="isolate z-1500 outline-none"
        align={align}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-1500 w-72 rounded-md bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
