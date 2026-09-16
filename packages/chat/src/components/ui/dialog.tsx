'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useChatRoot } from '@/lib/chatRoot';
import { XIcon } from 'lucide-react';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

// See note in components/ui/button.tsx — forwardRef is required so Base UI's
// render-prop composition (e.g. `<DialogTrigger render={<Button ... />}>`)
// can attach a ref to this component on React 18.
const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogPrimitive.Trigger.Props>(
  function DialogTrigger(props, ref) {
    return <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />;
  },
);

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  const container = useChatRoot();
  return <DialogPrimitive.Portal data-slot="dialog-portal" container={container} {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'udi:fixed udi:inset-0 udi:isolate udi:z-1499 udi:bg-black/10 udi:duration-100 udi:supports-backdrop-filter:backdrop-blur-xs udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-closed:animate-out udi:data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'udi:fixed udi:top-1/2 udi:left-1/2 udi:z-1500 udi:grid udi:w-full udi:max-w-[calc(100%-2rem)] udi:-translate-x-1/2 udi:-translate-y-1/2 udi:gap-4 udi:rounded-xl udi:bg-popover udi:p-4 udi:text-sm udi:text-popover-foreground udi:ring-1 udi:ring-foreground/10 udi:duration-100 udi:outline-none udi:sm:max-w-sm udi:data-open:animate-in udi:data-open:fade-in-0 udi:data-open:zoom-in-95 udi:data-closed:animate-out udi:data-closed:fade-out-0 udi:data-closed:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="udi:absolute udi:top-2 udi:right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="udi:sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('udi:flex udi:flex-col udi:gap-2', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'udi:-mx-4 udi:-mb-4 udi:flex udi:flex-col-reverse udi:gap-2 udi:rounded-b-xl udi:border-t udi:bg-muted/50 udi:p-4 udi:sm:flex-row udi:sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('udi:font-heading udi:text-base udi:leading-none udi:font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'udi:text-sm udi:text-muted-foreground udi:*:[a]:underline udi:*:[a]:underline-offset-3 udi:*:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
