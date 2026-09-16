'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('udi:flex udi:flex-col', className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('udi:border-b udi:last:border-b-0', className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  headerClassName,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  /**
   * Applied to the wrapping `<Header>` rather than the trigger button. Lets a
   * consumer make the header `sticky` — which has to sit on the header, since
   * the button is a flex child of it.
   */
  headerClassName?: string;
}) {
  return (
    <AccordionPrimitive.Header className={cn('udi:flex', headerClassName)}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'udi:flex udi:flex-1 udi:items-center udi:justify-between udi:gap-2 udi:py-2 udi:text-left udi:text-sm udi:font-medium udi:transition-all udi:outline-none udi:hover:underline udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:[&[data-panel-open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="udi:size-4 udi:shrink-0 udi:text-muted-foreground udi:transition-transform" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn('udi:overflow-hidden udi:text-sm', className)}
      {...props}
    >
      <div className="udi:pb-2">{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
