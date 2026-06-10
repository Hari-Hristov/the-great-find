import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-accent)] text-[var(--color-bg-base)]",
        secondary:
          "border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] text-[var(--color-text-muted)]",
        success:
          "border-transparent bg-[var(--color-success)] text-[var(--color-bg-base)]",
        danger:
          "border-transparent bg-[var(--color-danger)] text-white",
        outline:
          "border-[var(--color-border-subtle)] text-[var(--color-text-primary)]",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
