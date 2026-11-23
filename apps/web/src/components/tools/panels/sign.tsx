"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type ChangeEvent, type PointerEvent } from "react";

import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "text" | "draw" | "upload";
const MODES: Mode[] = ["text", "draw", "upload"];
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripPrefix(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function useSignPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_sign");
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState("last");
  const [x, setX] = useState(75);
  const [y, setY] = useState(12);
  const [width, setWidth] = useState(25);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * element.width,
      y: ((event.clientY - bounds.top) / bounds.height) * element.height,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111111";
    const origin = point(event);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    setDrawn(event.currentTarget.toDataURL("image/png"));
  };

  const clear = () => {
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    setDrawn(null);
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    setError(null);
    setUploaded(await readAsDataUrl(file));
  };

  const image = mode === "draw" ? drawn : mode === "upload" ? uploaded : null;
  const missing = mode === "text" ? text.trim() === "" : image === null ? t("needImage") : null;
  const problem = error ?? (mode === "text" ? (text.trim() ? null : t("needText")) : missing);

  const number = (value: number, setter: (next: number) => void, min: number, max: number) => (
    <Input
      dir="ltr"
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => setter(Math.min(Math.max(Number(event.target.value) || 0, min), max))}
    />
  );

  return {
    main: null,
    options: (
      <div className="flex flex-col gap-4" data-sign-options>
        <div className="flex gap-1.5" role="tablist" aria-label={t("modeLabel")}>
          {MODES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={mode === entry}
              onClick={() => setMode(entry)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                mode === entry ? "border-primary bg-primary-subtle" : "border-border text-muted",
              )}
            >
              {t(`mode_${entry}`)}
            </button>
          ))}
        </div>
        {mode === "text" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sign-text" className="text-sm font-medium">
              {t("typeLabel")}
            </label>
            <Input
              id="sign-text"
              value={text}
              maxLength={120}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        ) : null}
        {mode === "draw" ? (
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvas}
              width={600}
              height={200}
              aria-label={t("drawLabel")}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={finish}
              className="w-full touch-none rounded-xl border border-border-strong bg-white"
            />
            <button
              type="button"
              onClick={clear}
              className="self-start text-xs font-medium text-primary"
            >
              {t("clear")}
            </button>
          </div>
        ) : null}
        {mode === "upload" ? (
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => void onUpload(event)}
            className="text-sm"
          />
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sign-pages" className="text-sm font-medium">
            {t("pagesLabel")}
          </label>
          <Input
            id="sign-pages"
            dir="ltr"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("x")}
            {number(x, setX, 0, 100)}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("y")}
            {number(y, setY, 0, 100)}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("width")}
            {number(width, setWidth, 3, 100)}
          </label>
        </div>
      </div>
    ),
    payload: {
      mode: mode === "text" ? "text" : "image",
      text: mode === "text" ? text.trim() : "",
      image_data: image ? stripPrefix(image) : null,
      pages: pages.trim() || "last",
      x_percent: x,
      y_percent: y,
      width_percent: width,
    },
    problem,
    summary: t("summary", { count: Math.max(files.length, 1) }),
  };
}
