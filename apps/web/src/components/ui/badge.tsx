import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-muted",
        primary: "bg-primary-subtle text-primary",
        accent: "bg-accent-subtle text-accent-strong",
        success: "bg-success-subtle text-success-strong",
        warning: "bg-warning-subtle text-warning-strong",
        danger: "bg-danger-subtle text-danger-strong",
        info: "bg-info-subtle text-info-strong",
        gradient: "bg-cta-gradient text-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
