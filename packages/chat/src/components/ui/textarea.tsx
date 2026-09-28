import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'udi:flex udi:field-sizing-content udi:min-h-16 udi:w-full udi:rounded-lg udi:border udi:border-input udi:bg-transparent udi:px-2.5 udi:py-2 udi:text-base udi:transition-colors udi:outline-none udi:placeholder:text-muted-foreground udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:disabled:cursor-not-allowed udi:disabled:bg-input/50 udi:disabled:opacity-50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:md:text-sm udi:dark:bg-input/30 udi:dark:disabled:bg-input/80 udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
