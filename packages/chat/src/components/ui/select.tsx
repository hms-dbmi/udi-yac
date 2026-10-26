import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';

import { cn } from '@/lib/utils';
import { useChatRoot } from '@/lib/chatRoot';
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react';

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('udi:scroll-my-1 udi:p-1', className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('udi:flex udi:flex-1 udi:text-left', className)}
      {...props}
    />
  );
}

// See note in components/ui/button.tsx — forwardRef is required so Base UI's
// render-prop composition can attach a ref to this component on React 18.
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectPrimitive.Trigger.Props & {
    size?: 'sm' | 'default';
  }
>(function SelectTrigger({ className, size = 'default', children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "udi:flex udi:w-fit udi:items-center udi:justify-between udi:gap-1.5 udi:rounded-lg udi:border udi:border-input udi:bg-transparent udi:py-2 udi:pr-2 udi:pl-2.5 udi:text-sm udi:whitespace-nowrap udi:transition-colors udi:outline-none udi:select-none udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:disabled:cursor-not-allowed udi:disabled:opacity-50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:data-placeholder:text-muted-foreground udi:data-[size=default]:h-8 udi:data-[size=sm]:h-7 udi:data-[size=sm]:rounded-[min(var(--radius-md),10px)] udi:*:data-[slot=select-value]:line-clamp-1 udi:*:data-[slot=select-value]:flex udi:*:data-[slot=select-value]:items-center udi:*:data-[slot=select-value]:gap-1.5 udi:dark:bg-input/30 udi:dark:hover:bg-input/50 udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="udi:pointer-events-none udi:size-4 udi:text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  );
});

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  const container = useChatRoot();
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="udi:isolate udi:z-1500"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            'udi:relative udi:isolate udi:z-1500 udi:max-h-(--available-height) udi:min-w-(--anchor-width) udi:w-max udi:origin-(--transform-origin) udi:overflow-x-hidden udi:overflow-y-auto udi:rounded-lg udi:bg-popover udi:text-popover-foreground udi:shadow-md udi:ring-1 udi:ring-foreground/10 udi:duration-100 udi:data-[align-trigger=true]:animate-none udi:data-[side=bottom]:slide-in-from-top-2 udi:data-[side=inline-end]:slide-in-from-left-2 udi:data-[side=inline-start]:slide-in-from-right-2 udi:data-[side=left]:slide-in-from-right-2 udi:data-[side=right]:slide-in-from-left-2 udi:data-[side=top]:slide-in-from-bottom-2 udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-open:zoom-in-95 udi:data-closed:animate-out udi:data-closed:fade-out-0 udi:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('udi:px-1.5 udi:py-1 udi:text-xs udi:text-muted-foreground', className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "udi:relative udi:flex udi:w-full udi:cursor-default udi:items-center udi:gap-1.5 udi:rounded-md udi:py-1 udi:pr-8 udi:pl-1.5 udi:text-sm udi:outline-hidden udi:select-none udi:focus:bg-accent udi:focus:text-accent-foreground udi:not-data-[variant=destructive]:focus:**:text-accent-foreground udi:data-disabled:pointer-events-none udi:data-disabled:opacity-50 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4 udi:*:[span]:last:flex udi:*:[span]:last:items-center udi:*:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="udi:flex udi:flex-1 udi:shrink-0 udi:gap-2 udi:whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="udi:pointer-events-none udi:absolute udi:right-2 udi:flex udi:size-4 udi:items-center udi:justify-center" />
        }
      >
        <CheckIcon className="udi:pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('udi:pointer-events-none udi:-mx-1 udi:my-1 udi:h-px udi:bg-border', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "udi:top-0 udi:z-10 udi:flex udi:w-full udi:cursor-default udi:items-center udi:justify-center udi:bg-popover udi:py-1 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "udi:bottom-0 udi:z-10 udi:flex udi:w-full udi:cursor-default udi:items-center udi:justify-center udi:bg-popover udi:py-1 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
