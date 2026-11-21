import type { ReactNode } from "react";

import { MeshBackground } from "@/components/ui/backgrounds";
import { Breadcrumbs, type Crumb } from "@/components/ui/blocks";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  breadcrumbs,
  aside,
  children,
  className,
  align = "start",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  align?: "start" | "center";
}) {
  return (
    <section className={cn("relative isolate overflow-hidden border-b border-border", className)}>
      <MeshBackground />
      <div className="container-page flex flex-col gap-6 pt-6 pb-14 sm:pb-20">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        <div className={cn("grid items-center gap-10", aside && "lg:grid-cols-[1.3fr_1fr]")}>
          <div
            className={cn(
              "flex flex-col gap-4 pt-6",
              align === "center" && "mx-auto max-w-3xl items-center text-center",
            )}
          >
            {eyebrow ? (
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
                {eyebrow}
              </span>
            ) : null}
            <h1 className="text-display font-extrabold tracking-tight">{title}</h1>
            {subtitle ? <p className="max-w-[60ch] text-lg text-muted">{subtitle}</p> : null}
            {children}
          </div>
          {aside ? <div className="mx-auto w-full max-w-md">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}
