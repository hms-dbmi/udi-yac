import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'udi:group/card udi:flex udi:flex-col udi:gap-4 udi:overflow-hidden udi:rounded-xl udi:bg-card udi:py-4 udi:text-sm udi:text-card-foreground udi:ring-1 udi:ring-foreground/10 udi:has-data-[slot=card-footer]:pb-0 udi:has-[>img:first-child]:pt-0 udi:data-[size=sm]:gap-3 udi:data-[size=sm]:py-3 udi:data-[size=sm]:has-data-[slot=card-footer]:pb-0 udi:*:[img:first-child]:rounded-t-xl udi:*:[img:last-child]:rounded-b-xl',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      // shadcn ships `[.border-b]:pb-4` here — extra padding when a caller also
      // puts `border-b` on the header. With Tailwind's `udi:` prefix that class is
      // `udi:border-b`, and an escaped colon inside an arbitrary variant
      // (`[.udi\:border-b]`) is not something Tailwind's candidate parser accepts,
      // so the rule silently generated nothing. Dropped rather than left dead: no
      // CardHeader in this app uses `border-b`. Set the padding explicitly if one does.
      className={cn(
        'udi:group/card-header udi:@container/card-header udi:grid udi:auto-rows-min udi:items-start udi:gap-1 udi:rounded-t-xl udi:px-4 udi:group-data-[size=sm]/card:px-3 udi:has-data-[slot=card-action]:grid-cols-[1fr_auto] udi:has-data-[slot=card-description]:grid-rows-[auto_auto]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'udi:font-heading udi:text-base udi:leading-snug udi:font-medium udi:group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('udi:text-sm udi:text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'udi:col-start-2 udi:row-span-2 udi:row-start-1 udi:self-start udi:justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('udi:px-4 udi:group-data-[size=sm]/card:px-3', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'udi:flex udi:items-center udi:rounded-b-xl udi:border-t udi:bg-muted/50 udi:p-4 udi:group-data-[size=sm]/card:p-3',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
