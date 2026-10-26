'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'udi:peer udi:group/switch udi:relative udi:inline-flex udi:shrink-0 udi:items-center udi:rounded-full udi:border udi:border-transparent udi:transition-all udi:outline-none udi:after:absolute udi:after:-inset-x-3 udi:after:-inset-y-2 udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:data-[size=default]:h-[18.4px] udi:data-[size=default]:w-[32px] udi:data-[size=sm]:h-[14px] udi:data-[size=sm]:w-[24px] udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40 udi:data-checked:bg-primary udi:data-unchecked:bg-input udi:dark:data-unchecked:bg-input/80 udi:data-disabled:cursor-not-allowed udi:data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="udi:pointer-events-none udi:block udi:rounded-full udi:bg-background udi:ring-0 udi:transition-transform udi:group-data-[size=default]/switch:size-4 udi:group-data-[size=sm]/switch:size-3 udi:group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] udi:group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] udi:dark:data-checked:bg-primary-foreground udi:group-data-[size=default]/switch:data-unchecked:translate-x-0 udi:group-data-[size=sm]/switch:data-unchecked:translate-x-0 udi:dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
