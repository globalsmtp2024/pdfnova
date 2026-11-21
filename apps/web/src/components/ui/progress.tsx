"use client";

import { m, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type ProgressProps = {
  value: number;
  label: string;
  className?: string;
  tone?: "brand" | "success" | "danger";
};

export function Progress({ value, label, className, tone = "brand" }: ProgressProps) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
    >
      <m.div
        className={cn(
          "h-full rounded-full",
          tone === "brand" && "bg-brand-gradient",
          tone === "success" && "bg-success",
          tone === "danger" && "bg-danger",
        )}
        initial={false}
        animate={{ width: `${clamped * 100}%` }}
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }
        }
      />
    </div>
  );
}
