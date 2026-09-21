'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'udi:peer udi:relative udi:flex udi:size-4 udi:shrink-0 udi:items-center udi:justify-center udi:rounded-[4px] udi:border udi:border-input udi:transition-colors udi:outline-none udi:group-has-disabled/field:opacity-50 udi:after:absolute udi:after:-inset-x-3 udi:after:-inset-y-2 udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:disabled:cursor-not-allowed udi:disabled:opacity-50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:aria-invalid:aria-checked:border-primary udi:dark:bg-input/30 udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40 udi:data-checked:border-primary udi:data-checked:bg-primary udi:data-checked:text-primary-foreground udi:dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="udi:grid udi:place-content-center udi:text-current udi:transition-none udi:[&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
