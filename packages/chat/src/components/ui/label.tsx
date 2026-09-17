'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'udi:flex udi:items-center udi:gap-2 udi:text-sm udi:leading-none udi:font-medium udi:select-none udi:group-data-[disabled=true]:pointer-events-none udi:group-data-[disabled=true]:opacity-50 udi:peer-disabled:cursor-not-allowed udi:peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
