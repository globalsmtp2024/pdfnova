"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "info";

export const TONE_VAR: Record<Tone, string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

export const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--warning)",
  "var(--info)",
  "var(--success)",
  "var(--danger)",
];

export function toneGradient(tone: Tone): CSSProperties {
  const color = TONE_VAR[tone];
  return {
    background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, #0b0d17))`,
  };
}

export function toneTint(tone: Tone, percent = 9): CSSProperties {
  return { background: `color-mix(in srgb, ${TONE_VAR[tone]} ${percent}%, var(--surface))` };
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-soft",
        className,
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-base font-semibold">{title}</h2>
            {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  large = false,
  visual,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone: Tone;
  large?: boolean;
  visual?: ReactNode;
}) {
  return (
    <div
      className="relative flex overflow-hidden rounded-(--radius-card) border border-border p-4 shadow-soft transition-shadow hover:shadow-lifted"
      style={toneTint(tone, large ? 11 : 7)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-10 -top-10 size-32 rounded-full opacity-25 blur-2xl"
        style={{ background: TONE_VAR[tone] }}
      />
      <div className="relative flex w-full items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">{label}</span>
          <span
            className={cn(
              "font-display font-bold tracking-tight tabular-nums",
              large ? "text-3xl" : "text-2xl",
            )}
          >
            {value}
          </span>
          {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        </div>
        {visual ?? (
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-soft"
            style={toneGradient(tone)}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone | "neutral"; children: ReactNode }) {
  if (tone === "neutral") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
        {children}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${TONE_VAR[tone]} 14%, var(--surface))`,
        color: `color-mix(in srgb, ${TONE_VAR[tone]} 80%, var(--foreground))`,
      }}
    >
      {children}
    </span>
  );
}

const AVATAR_TONES: Tone[] = ["primary", "accent", "info", "warning", "success", "danger"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
      )}
      style={toneGradient(tone)}
    >
      {initials}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-border-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-4.5 rounded-full bg-white shadow-soft transition-[margin] duration-200",
          checked ? "ms-6" : "ms-0.5",
        )}
      />
    </button>
  );
}

type Series = { key: string; label: string; color: string; values: number[] };

function niceMax(value: number) {
  const raw = Math.max(value, 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude * 4;
}

function smoothPath(points: [number, number][]) {
  if (points.length === 0) return "";
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const mid = (x0 + x1) / 2;
    path += ` C ${mid} ${y0}, ${mid} ${y1}, ${x1} ${y1}`;
  }
  return path;
}

const WIDTH = 600;
const HEIGHT = 200;

export function AreaChart({
  labels,
  series,
  ariaLabel,
  formatLabel,
}: {
  labels: string[];
  series: Series[];
  ariaLabel: string;
  formatLabel: (label: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const count = labels.length;
  const max = niceMax(Math.max(...series.flatMap((entry) => entry.values), 1));
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * WIDTH : WIDTH / 2);
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 8) - 4;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = [0, Math.floor((count - 1) / 2), count - 1];
  return (
    <div className="flex flex-col gap-2" dir="ltr">
      <div className="relative flex">
        <div className="flex w-9 shrink-0 flex-col-reverse justify-between pb-1 text-[10px] text-muted tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="leading-none">
              {Math.round(max * tick)}
            </span>
          ))}
        </div>
        <div
          className="relative h-[200px] min-w-0 flex-1"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            setHover(Math.min(Math.max(Math.round(ratio * (count - 1)), 0), count - 1));
          }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ bottom: `${tick * 100}%` }}
            />
          ))}
          <svg
            role="img"
            aria-label={ariaLabel}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              {series.map((entry) => (
                <linearGradient
                  key={entry.key}
                  id={`area-${entry.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor={entry.color} stopOpacity="0.35" />
                  <stop offset="1" stopColor={entry.color} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>
            {series.map((entry) => {
              const points = entry.values.map((value, index): [number, number] => [
                x(index),
                y(value),
              ]);
              const line = smoothPath(points);
              return (
                <g key={entry.key}>
                  <path
                    d={`${line} L ${x(count - 1)} ${HEIGHT} L ${x(0)} ${HEIGHT} Z`}
                    fill={`url(#area-${entry.key})`}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null ? (
            <>
              <div
                aria-hidden
                className="absolute inset-y-0 w-px bg-border-strong"
                style={{ left: `${count > 1 ? (hover / (count - 1)) * 100 : 50}%` }}
              />
              {series.map((entry) => (
                <span
                  key={entry.key}
                  aria-hidden
                  className="absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface"
                  style={{
                    left: `${count > 1 ? (hover / (count - 1)) * 100 : 50}%`,
                    bottom: `${((entry.values[hover] ?? 0) / max) * 96 + 2}%`,
                    background: entry.color,
                  }}
                />
              ))}
              <div
                className="pointer-events-none absolute top-0 z-10 flex min-w-32 -translate-x-1/2 flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lifted"
                style={{
                  left: `${Math.min(Math.max(count > 1 ? (hover / (count - 1)) * 100 : 50, 14), 86)}%`,
                }}
              >
                <span className="font-semibold">{formatLabel(labels[hover])}</span>
                {series.map((entry) => (
                  <span key={entry.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="size-2 rounded-full" style={{ background: entry.color }} />
                      {entry.label}
                    </span>
                    <span className="font-semibold tabular-nums">{entry.values[hover]}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="ms-9 flex justify-between text-[10px] text-muted">
        {labelIndexes.map((index, position) => (
          <span key={`${index}-${position}`}>{formatLabel(labels[index] ?? "")}</span>
        ))}
      </div>
      <ul className="ms-9 flex flex-wrap gap-4 text-xs text-muted">
        {series.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: entry.color }} />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Donut({
  slices,
  center,
  centerLabel,
  ariaLabel,
}: {
  slices: { key: string; label: string; value: number; color: string }[];
  center: ReactNode;
  centerLabel?: string;
  ariaLabel: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row" dir="ltr">
      <div className="relative size-36 shrink-0">
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth="12"
          />
          {total > 0
            ? slices.map((slice) => {
                const length = (slice.value / total) * circumference;
                const element = (
                  <circle
                    key={slice.key}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="12"
                    strokeDasharray={`${Math.max(length - 1.5, 0)} ${circumference}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-xl font-bold tabular-nums">{center}</span>
          {centerLabel ? <span className="text-[10px] text-muted">{centerLabel}</span> : null}
        </div>
      </div>
      <ul className="flex w-full flex-col gap-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: slice.color }}
              />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="text-muted tabular-nums">
              {slice.value}
              {total ? ` · ${Math.round((slice.value / total) * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankBars({
  rows,
}: {
  rows: { key: string; name: string; value: number; display: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                style={toneGradient(AVATAR_TONES[index % AVATAR_TONES.length])}
              >
                {index + 1}
              </span>
              <span className="truncate font-medium">{row.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{row.display}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" dir="ltr">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, color-mix(in srgb, ${CHART_COLORS[index % CHART_COLORS.length]} 55%, var(--surface)))`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Meter({ value, tone }: { value: number; tone: Tone }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-muted" dir="ltr">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, ...toneGradient(tone) }}
      />
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-(--radius-card) border border-border bg-surface shadow-soft">
      {children}
    </div>
  );
}

export const TH = "px-4 py-3 text-start text-xs font-semibold tracking-wide text-muted uppercase";
export const TD = "px-4 py-3 align-middle";
