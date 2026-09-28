import { forwardRef } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "udi:group/button udi:inline-flex udi:shrink-0 udi:items-center udi:justify-center udi:rounded-lg udi:border udi:border-transparent udi:bg-clip-padding udi:text-sm udi:font-medium udi:whitespace-nowrap udi:transition-all udi:outline-none udi:select-none udi:focus-visible:border-ring udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:active:not-aria-[haspopup]:translate-y-px udi:disabled:pointer-events-none udi:disabled:opacity-50 udi:aria-invalid:border-destructive udi:aria-invalid:ring-3 udi:aria-invalid:ring-destructive/20 udi:dark:aria-invalid:border-destructive/50 udi:dark:aria-invalid:ring-destructive/40 udi:[&_svg]:pointer-events-none udi:[&_svg]:shrink-0 udi:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'udi:bg-primary udi:text-primary-foreground udi:[a]:hover:bg-primary/80',
        outline:
          'udi:border-border udi:bg-background udi:hover:bg-muted udi:hover:text-foreground udi:aria-expanded:bg-muted udi:aria-expanded:text-foreground udi:dark:border-input udi:dark:bg-input/30 udi:dark:hover:bg-input/50',
        secondary:
          'udi:bg-secondary udi:text-secondary-foreground udi:hover:bg-secondary/80 udi:aria-expanded:bg-secondary udi:aria-expanded:text-secondary-foreground',
        ghost:
          'udi:hover:bg-muted udi:hover:text-foreground udi:aria-expanded:bg-muted udi:aria-expanded:text-foreground udi:dark:hover:bg-muted/50',
        destructive:
          'udi:bg-destructive/10 udi:text-destructive udi:hover:bg-destructive/20 udi:focus-visible:border-destructive/40 udi:focus-visible:ring-destructive/20 udi:dark:bg-destructive/20 udi:dark:hover:bg-destructive/30 udi:dark:focus-visible:ring-destructive/40',
        link: 'udi:text-primary udi:underline-offset-4 udi:hover:underline',
      },
      size: {
        default:
          'udi:h-8 udi:gap-1.5 udi:px-2.5 udi:has-data-[icon=inline-end]:pr-2 udi:has-data-[icon=inline-start]:pl-2',
        xs: "udi:h-6 udi:gap-1 udi:rounded-[min(var(--radius-md),10px)] udi:px-2 udi:text-xs udi:in-data-[slot=button-group]:rounded-lg udi:has-data-[icon=inline-end]:pr-1.5 udi:has-data-[icon=inline-start]:pl-1.5 udi:[&_svg:not([class*='size-'])]:size-3",
        sm: "udi:h-7 udi:gap-1 udi:rounded-[min(var(--radius-md),12px)] udi:px-2.5 udi:text-[0.8rem] udi:in-data-[slot=button-group]:rounded-lg udi:has-data-[icon=inline-end]:pr-1.5 udi:has-data-[icon=inline-start]:pl-1.5 udi:[&_svg:not([class*='size-'])]:size-3.5",
        lg: 'udi:h-9 udi:gap-1.5 udi:px-2.5 udi:has-data-[icon=inline-end]:pr-2 udi:has-data-[icon=inline-start]:pl-2',
        icon: 'udi:size-8',
        'icon-xs':
          "udi:size-6 udi:rounded-[min(var(--radius-md),10px)] udi:in-data-[slot=button-group]:rounded-lg udi:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'udi:size-7 udi:rounded-[min(var(--radius-md),12px)] udi:in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'udi:size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

// forwardRef is required so Base UI's render-prop composition (e.g.
// `<DialogPrimitive.Close render={<Button ... />}>`) can attach a ref to
// this component on React 18. Without it, React 18 logs
// "Function components cannot be given refs" and the trigger ref never
// reaches Floating UI, which causes dropdowns to render at (0,0) with
// opacity 0 instead of anchored to their trigger.
// Once HuBMAP updates to react 19, we can remove forwardRef and just export a normal function component again.
type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});

export { Button, buttonVariants };
