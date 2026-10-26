import * as React from 'react';
import { Slider as SliderPrimitive } from '@base-ui/react/slider';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      className={cn('udi:data-horizontal:w-full udi:data-vertical:h-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="udi:relative udi:flex udi:w-full udi:touch-none udi:items-center udi:select-none udi:data-disabled:opacity-50 udi:data-vertical:h-full udi:data-vertical:min-h-40 udi:data-vertical:w-auto udi:data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="udi:relative udi:grow udi:overflow-hidden udi:rounded-full udi:bg-border udi:select-none udi:data-horizontal:h-1.5 udi:data-horizontal:w-full udi:data-vertical:h-full udi:data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="udi:bg-primary udi:select-none udi:data-horizontal:h-full udi:data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="udi:relative udi:block udi:size-3 udi:shrink-0 udi:rounded-full udi:border udi:border-ring udi:bg-white udi:ring-ring/50 udi:transition-[color,box-shadow] udi:select-none udi:after:absolute udi:after:-inset-2 udi:hover:ring-3 udi:focus-visible:ring-3 udi:focus-visible:outline-hidden udi:active:ring-3 udi:disabled:pointer-events-none udi:disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
