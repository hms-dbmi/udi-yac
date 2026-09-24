'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('udi:group/tabs udi:flex udi:gap-2 udi:data-horizontal:flex-col', className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'udi:group/tabs-list udi:inline-flex udi:w-fit udi:items-center udi:justify-center udi:rounded-lg udi:p-[3px] udi:text-muted-foreground udi:group-data-horizontal/tabs:h-8 udi:group-data-vertical/tabs:h-fit udi:group-data-vertical/tabs:flex-col udi:data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'udi:bg-muted',
        line: 'udi:gap-1 udi:bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "udi:relative udi:inline-flex udi:h-[calc(100%-1px)] udi:flex-1 udi:items-center udi:justify-center udi:gap-1.5 udi:rounded-md udi:border udi:border-transparent udi:px-1.5 udi:py-0.5 udi:text-sm udi:font-medium udi:whitespace-nowrap udi:text-foreground/60 udi:transition-all udi:group-data-vertical/tabs:w-full udi:group-data-vertical/tabs:justify-start udi:hover:text-foreground udi:focus-visible:border-ring udi:focus-visible:ring-[3px] udi:focus-visible:ring-ring/50 udi:focus-visible:outline-1 udi:focus-visible:outline-ring udi:disabled:pointer-events-none udi:disabled:opacity-50 udi:has-data-[icon=inline-end]:pr-1 udi:has-data-[icon=inline-start]:pl-1 udi:aria-disabled:pointer-events-none udi:aria-disabled:opacity-50 udi:dark:text-muted-foreground udi:dark:hover:text-foreground udi:group-data-[variant=default]/tabs-list:data-active:shadow-sm udi:group-data-[variant=line]/tabs-list:data-active:shadow-none udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
        'udi:group-data-[variant=line]/tabs-list:bg-transparent udi:group-data-[variant=line]/tabs-list:data-active:bg-transparent udi:dark:group-data-[variant=line]/tabs-list:data-active:border-transparent udi:dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'udi:data-active:bg-background udi:data-active:text-foreground udi:dark:data-active:border-input udi:dark:data-active:bg-input/30 udi:dark:data-active:text-foreground',
        'udi:after:absolute udi:after:bg-foreground udi:after:opacity-0 udi:after:transition-opacity udi:group-data-horizontal/tabs:after:inset-x-0 udi:group-data-horizontal/tabs:after:bottom-[-5px] udi:group-data-horizontal/tabs:after:h-0.5 udi:group-data-vertical/tabs:after:inset-y-0 udi:group-data-vertical/tabs:after:-right-1 udi:group-data-vertical/tabs:after:w-0.5 udi:group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('udi:flex-1 udi:text-sm udi:outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
