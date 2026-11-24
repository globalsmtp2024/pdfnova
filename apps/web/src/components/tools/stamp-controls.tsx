"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Input, Select } from "@/components/ui/input";
import { apiJson } from "@/lib/api";
import {
  ANCHORS,
  toScreen,
  visualPageSize,
  type Anchor,
  type PageSize,
  type Point,
} from "@/lib/stamp-placement";
import { cn } from "@/lib/utils";

export type FontKey =
  | "inter"
  | "noto-sans"
  | "noto-serif"
  | "noto-sans-mono"
  | "noto-sans-arabic"
  | "noto-nastaliq-urdu";

export const FONT_KEYS: FontKey[] = [
  "noto-sans",
  "inter",
  "noto-serif",
  "noto-sans-mono",
  "noto-sans-arabic",
  "noto-nastaliq-urdu",
];

export const FONT_LABELS: Record<FontKey, string> = {
  inter: "Inter",
  "noto-sans": "Noto Sans",
  "noto-serif": "Noto Serif",
  "noto-sans-mono": "Noto Sans Mono",
  "noto-sans-arabic": "Noto Sans Arabic",
  "noto-nastaliq-urdu": "Noto Nastaliq Urdu",
};

const FONT_FAMILIES: Record<FontKey, string> = {
  inter: "Inter, ui-sans-serif, sans-serif",
  "noto-sans": "'Noto Sans', ui-sans-serif, sans-serif",
  "noto-serif": "'Noto Serif', ui-serif, serif",
  "noto-sans-mono": "'Noto Sans Mono', ui-monospace, monospace",
  "noto-sans-arabic": "'Noto Sans Arabic', 'Noto Sans', sans-serif",
  "noto-nastaliq-urdu": "'Noto Nastaliq Urdu', 'Noto Sans Arabic', serif",
};

export const PREVIEW_WIDTH = 280;
const DEFAULT_PAGE: PageSize = { width: 595, height: 842 };

export function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              option.value === value
                ? "border-primary bg-primary-subtle text-foreground"
                : "border-border text-muted hover:border-primary/50",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PositionGrid({
  legend,
  value,
  onChange,
  labels,
}: {
  legend: string;
  value: Anchor;
  onChange: (value: Anchor) => void;
  labels: Record<Anchor, string>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="grid w-28 grid-cols-3 gap-1 rounded-xl border border-border p-1.5" dir="ltr">
        {ANCHORS.map((anchor) => (
          <button
            key={anchor}
            type="button"
            aria-label={labels[anchor]}
            aria-pressed={anchor === value}
            data-anchor={anchor}
            onClick={() => onChange(anchor)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md transition-colors",
              anchor === value ? "bg-primary" : "bg-surface-muted hover:bg-primary/30",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                anchor === value ? "bg-primary-foreground" : "bg-muted",
              )}
            />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function NumberInput({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(String(value));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        dir="ltr"
        type="number"
        inputMode="decimal"
        className="h-9"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() && Number.isFinite(parsed))
            onChange(Math.min(Math.max(parsed, min), max));
        }}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-16 cursor-pointer rounded-(--radius-control) border border-border-strong bg-surface p-1"
      />
    </div>
  );
}

export function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted tabular-nums" dir="ltr">
          {display}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-(--primary)"
      />
    </div>
  );
}

type PageInfo = { width_pt: number; height_pt: number; rotation: number };

export function useFirstPageSize(fileId: string | null): PageSize | null {
  const [size, setSize] = useState<PageSize | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!fileId) return;
    apiJson<{ pages: PageInfo[] }>(`/api/v1/files/${fileId}/inspect`, { method: "POST", json: {} })
      .then((result) => {
        const first = result.pages[0];
        if (!cancelled && first)
          setSize(visualPageSize(first.width_pt, first.height_pt, first.rotation));
      })
      .catch(() => {
        if (!cancelled) setSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  return fileId ? size : null;
}

export function StampPreview({
  fileId,
  label,
  caption,
  children,
}: {
  fileId: string | null;
  label: string;
  caption: string;
  children: (context: { page: PageSize; scale: number }) => ReactNode;
}) {
  const reported = useFirstPageSize(fileId);
  const [ratio, setRatio] = useState<number | null>(null);
  const page: PageSize =
    reported ??
    (ratio ? { width: DEFAULT_PAGE.width, height: DEFAULT_PAGE.width * ratio } : DEFAULT_PAGE);
  const scale = PREVIEW_WIDTH / page.width;
  return (
    <figure className="flex flex-col items-center gap-2" data-stamp-preview>
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-surface shadow-soft"
        style={{ width: PREVIEW_WIDTH, height: page.height * scale }}
        dir="ltr"
      >
        {fileId ? (
          <img
            src={`/api/v1/files/${fileId}/pages/1/thumbnail?width=320`}
            alt={label}
            className="absolute inset-0 size-full object-fill"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth) setRatio(image.naturalHeight / image.naturalWidth);
            }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {children({ page, scale })}
        </div>
      </div>
      <figcaption className="text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}

export type PreviewTextStyle = {
  font: FontKey;
  size: number;
  bold: boolean;
  color: string;
  opacity: number;
  direction: "auto" | "ltr" | "rtl";
};

export function PlacedText({
  text,
  style,
  scale,
  page,
  rotation,
  place,
  limit = 300,
}: {
  text: string;
  style: PreviewTextStyle;
  scale: number;
  page: PageSize;
  rotation: number;
  place: (box: PageSize) => Point[];
  limit?: number;
}) {
  const probe = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<PageSize>({ width: 0, height: 0 });
  const css: CSSProperties = {
    fontFamily: FONT_FAMILIES[style.font],
    fontSize: style.size * scale,
    fontWeight: style.bold ? 700 : 400,
    color: style.color,
    opacity: style.opacity,
    lineHeight: 1.25,
    whiteSpace: "pre",
    textAlign: "center",
    direction: style.direction === "auto" ? undefined : style.direction,
    unicodeBidi: "plaintext",
  };
  useLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    const next = { width: element.offsetWidth / scale, height: element.offsetHeight / scale };
    setBox((current) =>
      Math.abs(current.width - next.width) > 0.5 || Math.abs(current.height - next.height) > 0.5
        ? next
        : current,
    );
  }, [text, scale, style.font, style.size, style.bold, style.direction]);
  const centers = box.width ? place(box).slice(0, limit) : [];
  return (
    <>
      <span
        ref={probe}
        style={{ ...css, position: "absolute", visibility: "hidden", left: 0, top: 0 }}
      >
        {text}
      </span>
      {centers.map((center, index) => {
        const { left, top } = toScreen(center, page, scale);
        return (
          <span
            key={index}
            data-preview-label
            style={{
              ...css,
              position: "absolute",
              left,
              top,
              transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
            }}
          >
            {text}
          </span>
        );
      })}
    </>
  );
}
