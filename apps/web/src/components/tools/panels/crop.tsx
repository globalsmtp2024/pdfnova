"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/api";
import {
  aspectRect,
  clampRect,
  fromPoints,
  fullRect,
  HANDLES,
  hasCrop,
  marginsToRect,
  moveRect,
  normalizeRotation,
  PAPER_ASPECTS,
  rectToMargins,
  resizeRect,
  roundTo,
  sideReference,
  SIDES,
  toPoints,
  type Handle,
  type Margins,
  type Rect,
  type Side,
  type Size,
  type Unit,
} from "@/lib/crop-math";
import { cn } from "@/lib/utils";

type CropMode = "visual" | "permanent";
type ApplyTo = "all" | "current" | "range" | "odd" | "even";
type InspectedPage = { width_pt: number; height_pt: number; rotation: number };
type Inspection = { page_count: number; pages: InspectedPage[] };
type Drag = { handle: Handle | "move"; startX: number; startY: number; rect: Rect; scale: number };

const UNITS: Unit[] = ["mm", "pt", "in", "%"];
const APPLY_TO: ApplyTo[] = ["all", "current", "range", "odd", "even"];
const PREVIEW_WIDTH = 768;
const ZERO: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
const HANDLE_POSITION: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

function Choice<T extends string>({
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
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
              option.value === value
                ? "border-primary bg-primary-subtle text-foreground"
                : "border-border text-muted hover:border-primary/50",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
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

function keyDelta(event: KeyboardEvent): { dx: number; dy: number } | null {
  const step = event.shiftKey ? 10 : 1;
  if (event.key === "ArrowLeft") return { dx: -step, dy: 0 };
  if (event.key === "ArrowRight") return { dx: step, dy: 0 };
  if (event.key === "ArrowUp") return { dx: 0, dy: -step };
  if (event.key === "ArrowDown") return { dx: 0, dy: step };
  return null;
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

export function useCropPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_crop");
  const first = files[0];
  const fileId = first?.uploadId ?? null;
  const ready = Boolean(
    fileId && first?.status === "ready" && (!first.encrypted || first.unlocked),
  );
  const password = first?.encrypted ? first.password : "";
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [margins, setMargins] = useState<Margins>(ZERO);
  const [unit, setUnit] = useState<Unit>("mm");
  const [aspect, setAspect] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [mode, setMode] = useState<CropMode>("visual");
  const [applyTo, setApplyTo] = useState<ApplyTo>("all");
  const [rangeText, setRangeText] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!ready || !fileId) return;
    let active = true;
    apiJson<Inspection>(`/api/v1/files/${fileId}/inspect`, {
      method: "POST",
      json: password ? { password } : {},
    })
      .then((result) => {
        if (!active) return;
        setInspection(result);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [fileId, password, ready]);

  const pageCount = inspection?.page_count ?? first?.pageCount ?? 0;
  const current = Math.min(pageIndex, Math.max(pageCount - 1, 0));
  const inspected = inspection?.pages[current] ?? null;
  const size: Size | null = useMemo(() => {
    if (!inspected) return null;
    const turned = normalizeRotation(inspected.rotation);
    return turned === 90 || turned === 270
      ? { width: inspected.height_pt, height: inspected.width_pt }
      : { width: inspected.width_pt, height: inspected.height_pt };
  }, [inspected]);

  const rect = useMemo(() => {
    if (!size) return null;
    return clampRect(marginsToRect(size, margins), size);
  }, [margins, size]);

  const commit = useCallback(
    (next: Rect) => {
      if (!size) return;
      const margin = rectToMargins(size, next);
      setMargins({
        top: roundTo(Math.max(margin.top, 0)),
        right: roundTo(Math.max(margin.right, 0)),
        bottom: roundTo(Math.max(margin.bottom, 0)),
        left: roundTo(Math.max(margin.left, 0)),
      });
    },
    [size],
  );

  const startDrag = (handle: Handle | "move", event: PointerEvent<HTMLElement>) => {
    if (!rect || !size || !surface.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = surface.current.getBoundingClientRect();
    drag.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      scale: size.width / Math.max(bounds.width, 1),
    };
  };

  const onDrag = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || !size) return;
    const dx = (event.clientX - active.startX) * active.scale;
    const dy = (event.clientY - active.startY) * active.scale;
    commit(
      active.handle === "move"
        ? moveRect(active.rect, dx, dy, size)
        : resizeRect(active.rect, active.handle, dx, dy, size, aspect),
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKey = (handle: Handle | "move") => (event: KeyboardEvent<HTMLElement>) => {
    const delta = keyDelta(event);
    if (!delta || !rect || !size) return;
    event.preventDefault();
    event.stopPropagation();
    commit(
      handle === "move"
        ? moveRect(rect, delta.dx, delta.dy, size)
        : resizeRect(rect, handle, delta.dx, delta.dy, size, aspect),
    );
  };

  const setSide = (side: Side, raw: string) => {
    const parsed = Number(raw);
    if (!size || !Number.isFinite(parsed)) return;
    const points = Math.max(toPoints(parsed, unit, sideReference(side, size)), 0);
    const opposite: Record<Side, Side> = {
      top: "bottom",
      bottom: "top",
      left: "right",
      right: "left",
    };
    const limit = sideReference(side, size) - margins[opposite[side]] - 1;
    setMargins({ ...margins, [side]: roundTo(Math.min(points, Math.max(limit, 0))) });
    setAspect(null);
  };

  const applyPreset = (preset: keyof typeof PAPER_ASPECTS) => {
    if (!size) return;
    setAuto(false);
    setAspect(null);
    commit(aspectRect(size, PAPER_ASPECTS[preset]));
  };

  const pages =
    applyTo === "current"
      ? `${current + 1}`
      : applyTo === "range"
        ? rangeText.trim()
        : applyTo === "odd" || applyTo === "even"
          ? applyTo
          : null;

  const payload: Record<string, unknown> = auto
    ? { mode, auto: true, pages }
    : { mode, auto: false, margins, pages };

  const problem =
    !auto && !hasCrop(margins)
      ? t("noCrop")
      : applyTo === "range" && !rangeText.trim()
        ? t("noRange")
        : null;

  const resultSize = rect
    ? `${roundTo(fromPoints(rect.width, "mm", 0), 1)} × ${roundTo(fromPoints(rect.height, "mm", 0), 1)} mm`
    : null;

  const preview =
    !ready || pageCount === 0 ? (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {first?.status === "ready" ? t("unlock") : t("waiting")}
      </p>
    ) : failed ? (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {t("inspectFailed")}
      </p>
    ) : !size || !rect ? (
      <p className="p-6 text-center text-sm text-muted">{t("loading")}</p>
    ) : (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 text-sm" dir="ltr">
          <button
            type="button"
            className="rounded-full p-1.5 hover:bg-surface-muted disabled:opacity-40"
            aria-label={t("previous")}
            disabled={current === 0}
            onClick={() => setPageIndex(current - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span data-crop-page={current + 1}>
            {t("pageOf", { page: current + 1, total: pageCount })}
          </span>
          <button
            type="button"
            className="rounded-full p-1.5 hover:bg-surface-muted disabled:opacity-40"
            aria-label={t("next")}
            disabled={current >= pageCount - 1}
            onClick={() => setPageIndex(current + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div
          ref={surface}
          dir="ltr"
          data-crop-surface
          className="relative w-full max-w-xl touch-none overflow-visible bg-surface-muted shadow-soft ring-1 ring-border-strong select-none"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
          {imageFailed ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              {t("previewUnavailable")}
            </p>
          ) : (
            <img
              key={`${fileId}-${current}`}
              src={`/api/v1/files/${fileId}/pages/${current + 1}/thumbnail?width=${PREVIEW_WIDTH}`}
              alt={t("previewAlt", { page: current + 1 })}
              draggable={false}
              onError={() => setImageFailed(true)}
              className="absolute inset-0 size-full object-fill"
            />
          )}
          {auto ? (
            <div className="absolute inset-0 flex items-end justify-center p-3">
              <p className="rounded-lg bg-surface px-3 py-2 text-xs shadow-soft">
                {t("autoActive")}
              </p>
            </div>
          ) : (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bg-overlay"
                style={{ height: percent(rect.y, size.height) }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-overlay"
                style={{ height: percent(size.height - rect.y - rect.height, size.height) }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-overlay"
                style={{
                  top: percent(rect.y, size.height),
                  height: percent(rect.height, size.height),
                  width: percent(rect.x, size.width),
                }}
              />
              <div
                className="pointer-events-none absolute right-0 bg-overlay"
                style={{
                  top: percent(rect.y, size.height),
                  height: percent(rect.height, size.height),
                  width: percent(size.width - rect.x - rect.width, size.width),
                }}
              />
              <div
                role="group"
                tabIndex={0}
                aria-label={t("cropArea")}
                aria-describedby="crop-keyboard-hint"
                data-crop-rect
                className="absolute cursor-move border-2 border-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  left: percent(rect.x, size.width),
                  top: percent(rect.y, size.height),
                  width: percent(rect.width, size.width),
                  height: percent(rect.height, size.height),
                }}
                onPointerDown={(event) => startDrag("move", event)}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKey("move")}
              >
                {HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    data-crop-handle={handle}
                    aria-label={t(`handles.${handle}`)}
                    className={cn(
                      "absolute size-4 rounded-sm border-2 border-primary bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      HANDLE_POSITION[handle],
                    )}
                    onPointerDown={(event) => startDrag(handle, event)}
                    onPointerMove={onDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={onKey(handle)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <p id="crop-keyboard-hint" className="text-xs text-muted">
          {t("keyboardHint")}
        </p>
      </div>
    );

  const options = (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={auto || !size}>
        <legend className="mb-1 text-sm font-medium">{t("margins")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {SIDES.map((side) => (
            <div key={side} className="flex flex-col gap-1">
              <label htmlFor={`crop-${side}`} className="text-xs text-muted">
                {t(`sides.${side}`)}
              </label>
              <Input
                id={`crop-${side}`}
                dir="ltr"
                type="number"
                inputMode="decimal"
                min={0}
                step={unit === "in" ? 0.05 : 1}
                value={
                  size ? roundTo(fromPoints(margins[side], unit, sideReference(side, size))) : 0
                }
                onChange={(event) => setSide(side, event.target.value)}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <Choice
        legend={t("unit")}
        name="crop-unit"
        value={unit}
        onChange={setUnit}
        options={UNITS.map((value) => ({
          value,
          label: t(`units.${value === "%" ? "percent" : value}`),
        }))}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={aspect !== null}
          disabled={auto || !rect}
          onChange={(event) =>
            setAspect(event.target.checked && rect ? rect.width / rect.height : null)
          }
        />
        {t("lockAspect")}
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("presets")}</legend>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary/50 disabled:opacity-40"
            disabled={!size}
            onClick={() => applyPreset("a4")}
          >
            {t("presetA4")}
          </button>
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary/50 disabled:opacity-40"
            disabled={!size}
            onClick={() => applyPreset("letter")}
          >
            {t("presetLetter")}
          </button>
          <button
            type="button"
            aria-pressed={auto}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              auto ? "border-primary bg-primary-subtle" : "border-border hover:border-primary/50",
            )}
            onClick={() => setAuto(!auto)}
          >
            {t("presetAuto")}
          </button>
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary/50"
            onClick={() => {
              setAuto(false);
              setAspect(null);
              if (size) commit(fullRect(size));
              else setMargins(ZERO);
            }}
          >
            {t("reset")}
          </button>
        </div>
        {auto ? <p className="text-xs text-muted">{t("autoHint")}</p> : null}
      </fieldset>
      <Choice
        legend={t("mode")}
        name="crop-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "visual", label: t("modes.visual") },
          { value: "permanent", label: t("modes.permanent") },
        ]}
      />
      <p className="text-xs text-muted" data-crop-mode-hint>
        {mode === "visual" ? t("modes.visualHint") : t("modes.permanentHint")}
      </p>
      <Choice
        legend={t("applyTo")}
        name="crop-apply"
        value={applyTo}
        onChange={setApplyTo}
        options={APPLY_TO.map((value) => ({ value, label: t(`apply.${value}`) }))}
      />
      {applyTo === "range" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="crop-range" className="text-sm font-medium">
            {t("rangeLabel")}
          </label>
          <Input
            id="crop-range"
            dir="ltr"
            value={rangeText}
            maxLength={2000}
            placeholder="1-3, 5, 8-end"
            onChange={(event) => setRangeText(event.target.value)}
          />
        </div>
      ) : null}
      {files.length > 1 ? (
        <p className="text-xs text-muted">{t("batch", { count: files.length })}</p>
      ) : null}
    </div>
  );

  return {
    main: preview,
    options,
    payload,
    problem,
    summary: auto ? t("summaryAuto") : resultSize ? t("summary", { size: resultSize }) : null,
  };
}
