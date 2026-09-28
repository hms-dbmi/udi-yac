import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'udi:h-8 udi:w-full udi:min-w-0 udi:rounded-lg udi:border udi:border-input udi:bg-transparent udi:px-2.5 udi:py-1 udi:text-base udi:transition-colors udi:outline-none udi:file:inline-flex udi:file:h-6 udi:file:border-0 udi:file:bg-transparent udi:file:text-sm udi:file:font-medium udi:file:text-foreground udi:placeholder:text-muted-foreground udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:disabled:pointer-events-none udi:disabled:cursor-not-allowed udi:disabled:bg-input/50 udi:disabled:opacity-50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:md:text-sm udi:dark:bg-input/30 udi:dark:disabled:bg-input/80 udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
