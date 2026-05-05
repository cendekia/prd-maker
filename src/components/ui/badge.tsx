import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        solid: "bg-fg-1 text-background",
        muted: "bg-bg-muted text-fg-1",
        subtle: "bg-bg-muted text-fg-3",
        outline: "border bg-background text-fg-2",
        accent: "bg-brand-500 text-white",
        accentSubtle: "bg-brand-50 text-brand-700",
        success:
          "bg-[oklch(0.62_0.17_145_/_0.14)] text-[oklch(0.42_0.17_145)]",
        warning:
          "bg-[oklch(0.74_0.16_75_/_0.18)] text-[oklch(0.45_0.13_75)]",
        danger:
          "bg-[oklch(0.577_0.245_27.325_/_0.14)] text-destructive",
        info: "bg-[oklch(0.62_0.15_230_/_0.14)] text-[oklch(0.42_0.15_230)]",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { badgeVariants };
