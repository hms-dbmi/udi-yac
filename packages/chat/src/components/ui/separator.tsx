import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';

import { cn } from '@/lib/utils';

function Separator({ className, orientation = 'horizontal', ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'udi:shrink-0 udi:bg-border udi:data-horizontal:h-px udi:data-horizontal:w-full udi:data-vertical:w-px udi:data-vertical:self-stretch',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
