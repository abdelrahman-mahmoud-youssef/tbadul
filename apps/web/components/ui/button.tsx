import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-input bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'min-h-touch px-4 text-base',
        lg: 'min-h-12 px-6 text-base',
        icon: 'size-touch',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
