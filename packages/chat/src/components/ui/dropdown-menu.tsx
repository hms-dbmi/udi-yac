import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { cn } from '@/lib/utils';
import { useChatRoot } from '@/lib/chatRoot';
import { ChevronRightIcon, CheckIcon } from 'lucide-react';

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  const container = useChatRoot();
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" container={container} {...props} />;
}

// See note in components/ui/button.tsx — forwardRef is required so Base UI's
// render-prop composition (e.g. `<DropdownMenuTrigger render={<Button ... />}>`)
// can attach a ref to this component on React 18.
const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, MenuPrimitive.Trigger.Props>(
  function DropdownMenuTrigger(props, ref) {
    return <MenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" {...props} />;
  },
);

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        className="udi:isolate udi:z-1500 udi:outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            // Width is content-driven: at LEAST the trigger width (so a
            // narrow popup against a wide trigger still looks attached) but
            // never less than 8 rem (preserves the original `min-w-32`
            // baseline for tiny icon triggers like a gear button), and
            // capped at min(400 px, 100vw) so it never exceeds the viewport
            // on narrow screens. Previously `w-(--anchor-width)` fixed the
            // popup to the trigger width, which combined with
            // `overflow-x-hidden` clipped any item label wider than the
            // trigger — visible on the "Download Data" menu where
            // "Download Raw Data" exceeded the button's width.
            'udi:z-1500 udi:max-h-(--available-height) udi:min-w-[max(8rem,var(--anchor-width))] udi:max-w-[min(400px,100vw)] udi:origin-(--transform-origin) udi:overflow-x-hidden udi:overflow-y-auto udi:rounded-lg udi:bg-popover udi:p-1 udi:text-popover-foreground udi:shadow-md udi:ring-1 udi:ring-foreground/10 udi:duration-100 udi:outline-none udi:data-[side=bottom]:slide-in-from-top-2 udi:data-[side=inline-end]:slide-in-from-left-2 udi:data-[side=inline-start]:slide-in-from-right-2 udi:data-[side=left]:slide-in-from-right-2 udi:data-[side=right]:slide-in-from-left-2 udi:data-[side=top]:slide-in-from-bottom-2 udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-open:zoom-in-95 udi:data-closed:animate-out udi:data-closed:overflow-hidden udi:data-closed:fade-out-0 udi:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'udi:px-1.5 udi:py-1 udi:text-xs udi:font-medium udi:text-muted-foreground udi:data-inset:pl-7',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        // `whitespace-nowrap` keeps each item on a single line so the popup's
        // `max-w-[min(400px,100vw)]` clip is the only horizontal constraint —
        // labels won't wrap into a stacked two-line item.
        "udi:group/dropdown-menu-item udi:relative udi:flex udi:cursor-default udi:items-center udi:gap-1.5 udi:rounded-md udi:px-1.5 udi:py-1 udi:text-sm udi:whitespace-nowrap udi:outline-hidden udi:select-none udi:focus:bg-accent udi:focus:text-accent-foreground udi:not-data-[variant=destructive]:focus:**:text-accent-foreground udi:data-inset:pl-7 udi:data-[variant=destructive]:text-destructive udi:data-[variant=destructive]:focus:bg-destructive/10 udi:data-[variant=destructive]:focus:text-destructive udi:dark:data-[variant=destructive]:focus:bg-destructive/20 udi:data-disabled:pointer-events-none udi:data-disabled:opacity-50 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4 udi:data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

// See note in components/ui/button.tsx — forwardRef is required so Base UI's
// render-prop composition can attach a ref to this component on React 18.
const DropdownMenuSubTrigger = React.forwardRef<
  HTMLButtonElement,
  MenuPrimitive.SubmenuTrigger.Props & {
    inset?: boolean;
  }
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <MenuPrimitive.SubmenuTrigger
      ref={ref}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "udi:flex udi:cursor-default udi:items-center udi:gap-1.5 udi:rounded-md udi:px-1.5 udi:py-1 udi:text-sm udi:outline-hidden udi:select-none udi:focus:bg-accent udi:focus:text-accent-foreground udi:not-data-[variant=destructive]:focus:**:text-accent-foreground udi:data-inset:pl-7 udi:data-popup-open:bg-accent udi:data-popup-open:text-accent-foreground udi:data-open:bg-accent udi:data-open:text-accent-foreground udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="udi:ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
});

function DropdownMenuSubContent({
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'udi:w-auto udi:min-w-24 udi:rounded-lg udi:bg-popover udi:p-1 udi:text-popover-foreground udi:shadow-lg udi:ring-1 udi:ring-foreground/10 udi:duration-100 udi:data-[side=bottom]:slide-in-from-top-2 udi:data-[side=left]:slide-in-from-right-2 udi:data-[side=right]:slide-in-from-left-2 udi:data-[side=top]:slide-in-from-bottom-2 udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-open:zoom-in-95 udi:data-closed:animate-out udi:data-closed:fade-out-0 udi:data-closed:zoom-out-95',
        className,
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "udi:relative udi:flex udi:cursor-default udi:items-center udi:gap-1.5 udi:rounded-md udi:py-1 udi:pr-8 udi:pl-1.5 udi:text-sm udi:outline-hidden udi:select-none udi:focus:bg-accent udi:focus:text-accent-foreground udi:focus:**:text-accent-foreground udi:data-inset:pl-7 udi:data-disabled:pointer-events-none udi:data-disabled:opacity-50 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="udi:pointer-events-none udi:absolute udi:right-2 udi:flex udi:items-center udi:justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "udi:relative udi:flex udi:cursor-default udi:items-center udi:gap-1.5 udi:rounded-md udi:py-1 udi:pr-8 udi:pl-1.5 udi:text-sm udi:outline-hidden udi:select-none udi:focus:bg-accent udi:focus:text-accent-foreground udi:focus:**:text-accent-foreground udi:data-inset:pl-7 udi:data-disabled:pointer-events-none udi:data-disabled:opacity-50 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="udi:pointer-events-none udi:absolute udi:right-2 udi:flex udi:items-center udi:justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('udi:-mx-1 udi:my-1 udi:h-px udi:bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'udi:ml-auto udi:text-xs udi:tracking-widest udi:text-muted-foreground udi:group-focus/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
