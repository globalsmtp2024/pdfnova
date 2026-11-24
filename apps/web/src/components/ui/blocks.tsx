import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { siteUrl } from "@/config/site";
import { cn } from "@/lib/utils";

const CALLOUT_TONES: Record<string, { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: "border-info/30 bg-info-subtle text-info-strong" },
  success: {
    icon: CircleCheck,
    classes: "border-success/30 bg-success-subtle text-success-strong",
  },
  warning: {
    icon: TriangleAlert,
    classes: "border-warning/30 bg-warning-subtle text-warning-strong",
  },
  danger: { icon: CircleAlert, classes: "border-danger/30 bg-danger-subtle text-danger-strong" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, classes } = CALLOUT_TONES[tone];
  return (
    <div
      role="note"
      className={cn("flex gap-3 rounded-(--radius-card) border p-4", classes, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-sm text-foreground">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-1", "text-foreground/85")}>{children}</div>
      </div>
    </div>
  );
}

export type StepData = { title: ReactNode; body: ReactNode; icon?: LucideIcon };

export function Stepper({ steps, className }: { steps: StepData[]; className?: string }) {
  return (
    <ol className={cn("grid gap-4 md:grid-cols-3", className)}>
      {steps.map((step, index) => (
        <li
          key={index}
          className="relative flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-cta-gradient font-display text-sm font-bold text-white shadow-lifted">
            {step.icon ? <step.icon className="size-5" aria-hidden /> : index + 1}
          </span>
          <h3 className="text-h3 font-semibold">{step.title}</h3>
          <p className="text-sm text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export type TimelineEntry = {
  id: string;
  date: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  badge?: ReactNode;
  items?: ReactNode[];
};

export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn("relative ms-3 border-s border-border", className)}>
      {entries.map((entry) => (
        <li key={entry.id} className="relative ps-8 pb-10 last:pb-0">
          <span
            aria-hidden
            className="absolute -start-[7px] top-1.5 size-3.5 rounded-full border-2 border-background bg-cta-gradient shadow-[0_0_0_4px_var(--primary-subtle)]"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">{entry.date}</span>
            {entry.badge}
          </div>
          <h3 className="mt-1 text-h3 font-semibold">{entry.title}</h3>
          {entry.body ? <div className="mt-2 text-muted">{entry.body}</div> : null}
          {entry.items?.length ? (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {entry.items.map((itemContent, index) => (
                <li key={index} className="flex gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden />
                  <span>{itemContent}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const t = useTranslations("common");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `${siteUrl}${crumb.href === "/" ? "" : crumb.href}` } : {}),
    })),
  };
  return (
    <nav aria-label={t("breadcrumb")} className={cn("text-sm text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="flip-rtl size-3.5" aria-hidden /> : null}
            {crumb.href && index < items.length - 1 ? (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={index === items.length - 1 ? "page" : undefined}
                className="text-foreground"
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </nav>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  titleAs: TitleTag = "p",
}: {
  icon: LucideIcon;
  titleAs?: "p" | "h1" | "h2";
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed border-border-strong p-8 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <TitleTag className="font-display text-lg font-semibold">{title}</TitleTag>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid auto-rows-[minmax(11rem,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FeatureCard({
  icon: Icon,
  title,
  body,
  className,
  badge,
  visual,
  color = "#5B4BFF",
}: {
  icon: LucideIcon;
  title: ReactNode;
  body: ReactNode;
  className?: string;
  badge?: ReactNode;
  visual?: ReactNode;
  color?: string;
}) {
  return (
    <div
      className={cn(
        "gradient-border group relative flex flex-col gap-3 overflow-hidden rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 ease-(--ease-spring) hover:-translate-y-0.5 hover:shadow-lifted",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-35"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex size-11 items-center justify-center rounded-xl text-white shadow-lifted"
          style={{
            background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #0b0d17))`,
          }}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {badge}
      </div>
      <h3 className="text-h3 font-semibold">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
      {visual ? <div className="mt-auto pt-2">{visual}</div> : null}
    </div>
  );
}

export function CategoryPill({
  label,
  color,
  active,
  href,
  onClick,
  count,
}: {
  label: string;
  color?: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  count?: number;
}) {
  const classes = cn(
    "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active
      ? "border-transparent bg-foreground text-background"
      : "border-border bg-surface text-muted hover:text-foreground",
  );
  const content = (
    <>
      {color ? (
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
      ) : null}
      {label}
      {count !== undefined ? (
        <span className={cn("text-xs", active ? "opacity-80" : "text-muted")}>{count}</span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} aria-pressed={active} onClick={onClick}>
      {content}
    </button>
  );
}
