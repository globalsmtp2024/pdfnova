import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SectionProps = HTMLAttributes<HTMLElement> & {
  tone?: "plain" | "surface" | "muted";
  bleed?: boolean;
};

export function Section({
  className,
  tone = "plain",
  bleed = false,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative scroll-mt-24 py-16 render-deferred sm:py-24",
        tone === "surface" && "border-y border-border bg-surface",
        tone === "muted" && "bg-surface-muted/60",
        className,
      )}
      {...props}
    >
      {bleed ? children : <div className="container-page">{children}</div>}
    </section>
  );
}

export type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "start" | "center";
  id?: string;
  as?: "h1" | "h2";
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "start",
  id,
  as: Heading = "h2",
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "mx-auto items-center text-center",
        align === "center" ? "max-w-2xl" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow ? (
        <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-primary">
          <span aria-hidden className="h-px w-6 bg-current opacity-60" />
          {eyebrow}
        </span>
      ) : null}
      <Heading
        id={id}
        className={cn(Heading === "h1" ? "text-display" : "text-h1", "font-bold tracking-tight")}
      >
        {title}
      </Heading>
      {subtitle ? <p className="max-w-[65ch] text-lg text-muted">{subtitle}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
