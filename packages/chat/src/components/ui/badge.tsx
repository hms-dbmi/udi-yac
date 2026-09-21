import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'udi:group/badge udi:inline-flex udi:h-5 udi:w-fit udi:shrink-0 udi:items-center udi:justify-center udi:gap-1 udi:overflow-hidden udi:rounded-4xl udi:border udi:border-transparent udi:px-2 udi:py-0.5 udi:text-xs udi:font-medium udi:whitespace-nowrap udi:transition-all udi:focus-visible:border-ring udi:focus-visible:ring-[3px] udi:focus-visible:ring-ring/50 udi:has-data-[icon=inline-end]:pr-1.5 udi:has-data-[icon=inline-start]:pl-1.5 udi:aria-invalid:border-destructive udi:aria-invalid:ring-destructive/20 udi:dark:aria-invalid:ring-destructive/40 udi:[&>svg]:pointer-events-none udi:[&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'udi:bg-primary udi:text-primary-foreground udi:[a]:hover:bg-primary/80',
        secondary: 'udi:bg-secondary udi:text-secondary-foreground udi:[a]:hover:bg-secondary/80',
        destructive:
          'udi:bg-destructive/10 udi:text-destructive udi:focus-visible:ring-destructive/20 udi:dark:bg-destructive/20 udi:dark:focus-visible:ring-destructive/40 udi:[a]:hover:bg-destructive/20',
        outline:
          'udi:border-border udi:text-foreground udi:[a]:hover:bg-muted udi:[a]:hover:text-muted-foreground',
        ghost: 'udi:hover:bg-muted udi:hover:text-muted-foreground udi:dark:hover:bg-muted/50',
        link: 'udi:text-primary udi:underline-offset-4 udi:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
