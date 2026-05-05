import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors transition-shadow disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:bg-primary/90 active:bg-primary/80",
        outline:
          "border border-input bg-background text-fg-1 shadow-[var(--shadow-xs)] hover:bg-bg-hover active:bg-bg-active",
        ghost:
          "bg-transparent text-fg-2 hover:bg-bg-hover hover:text-fg-1 active:bg-bg-active",
        accent:
          "bg-brand-500 text-white shadow-[var(--shadow-xs)] hover:bg-brand-600 active:bg-brand-700",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-xs)] hover:bg-destructive/90 active:bg-destructive/80",
        link: "text-link underline-offset-2 hover:underline hover:text-link-hover",
      },
      size: {
        sm: "h-7 rounded-[var(--radius-sm)] px-2.5 text-xs [&_svg]:size-3.5",
        default: "h-9 rounded-[var(--radius-md)] px-3.5 text-[13px] [&_svg]:size-4",
        lg: "h-10 rounded-[var(--radius-md)] px-4.5 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 rounded-[var(--radius-md)] [&_svg]:size-4",
        "icon-sm": "h-7 w-7 rounded-[var(--radius-sm)] [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
