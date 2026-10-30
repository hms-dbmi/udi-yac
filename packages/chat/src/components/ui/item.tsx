import * as React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

function ItemGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn(
        'udi:group/item-group udi:flex udi:w-full udi:flex-col udi:gap-4 udi:has-data-[size=sm]:gap-2.5 udi:has-data-[size=xs]:gap-2',
        className,
      )}
      {...props}
    />
  );
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn('udi:my-2', className)}
      {...props}
    />
  );
}

const itemVariants = cva(
  'udi:group/item udi:flex udi:w-full udi:flex-wrap udi:items-center udi:rounded-lg udi:border udi:text-sm udi:transition-colors udi:duration-100 udi:outline-none udi:focus-visible:border-ring udi:focus-visible:ring-[3px] udi:focus-visible:ring-ring/50 udi:[a]:transition-colors udi:[a]:hover:bg-muted',
  {
    variants: {
      variant: {
        default: 'udi:border-transparent',
        outline: 'udi:border-border',
        muted: 'udi:border-transparent udi:bg-muted/50',
      },
      size: {
        default: 'udi:gap-2.5 udi:px-3 udi:py-2.5',
        sm: 'udi:gap-2.5 udi:px-3 udi:py-2.5',
        xs: 'udi:gap-2 udi:px-2.5 udi:py-2 udi:in-data-[slot=dropdown-menu-content]:p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Item({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'div'> & VariantProps<typeof itemVariants>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(itemVariants({ variant, size, className })),
      },
      props,
    ),
    render,
    state: {
      slot: 'item',
      variant,
      size,
    },
  });
}

const itemMediaVariants = cva(
  'udi:flex udi:shrink-0 udi:items-center udi:justify-center udi:gap-2 udi:group-has-data-[slot=item-description]/item:translate-y-0.5 udi:group-has-data-[slot=item-description]/item:self-start udi:[&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'udi:bg-transparent',
        icon: 'udi:[&_svg:not([class*=size-])]:size-4',
        image:
          'udi:size-10 udi:overflow-hidden udi:rounded-sm udi:group-data-[size=sm]/item:size-8 udi:group-data-[size=xs]/item:size-6 udi:[&_img]:size-full udi:[&_img]:object-cover',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function ItemMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-content"
      className={cn(
        'udi:flex udi:flex-1 udi:flex-col udi:gap-1 udi:group-data-[size=xs]/item:gap-0 udi:[&+[data-slot=item-content]]:flex-none',
        className,
      )}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        'udi:line-clamp-1 udi:flex udi:w-fit udi:items-center udi:gap-2 udi:text-sm udi:leading-snug udi:font-medium udi:underline-offset-4',
        className,
      )}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        'udi:line-clamp-2 udi:text-left udi:text-sm udi:leading-normal udi:font-normal udi:text-muted-foreground udi:group-data-[size=xs]/item:text-xs udi:[&>a]:underline udi:[&>a]:underline-offset-4 udi:[&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-actions"
      className={cn('udi:flex udi:items-center udi:gap-2', className)}
      {...props}
    />
  );
}

function ItemHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-header"
      className={cn(
        'udi:flex udi:basis-full udi:items-center udi:justify-between udi:gap-2',
        className,
      )}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-footer"
      className={cn(
        'udi:flex udi:basis-full udi:items-center udi:justify-between udi:gap-2',
        className,
      )}
      {...props}
    />
  );
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
};
