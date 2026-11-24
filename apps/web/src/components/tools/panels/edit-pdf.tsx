"use client";

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Highlighter,
  ImagePlus,
  Link2,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Replace,
  Square,
  StickyNote,
  TextCursorInput,
  Trash2,
  Type,
  type LucideIcon,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { PdfPageCanvas, usePdfDocument, type PageView } from "@/components/tools/pdf-page-canvas";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clamp,
  commit,
  EMPTY_HISTORY,
  moveOp,
  newId,
  opsOnPage,
  redo,
  toPayload,
  undo,
  type EditOp,
  type EditorTool,
  type History,
} from "@/lib/editor-ops";
import { countMatches, textInRegion } from "@/lib/pdf-text";
import { cn } from "@/lib/utils";

const TOOLS: { id: EditorTool; icon: LucideIcon }[] = [
  { id: "select", icon: MousePointer2 },
  { id: "text", icon: Type },
  { id: "edit_text", icon: TextCursorInput },
  { id: "image", icon: ImagePlus },
  { id: "rectangle", icon: Square },
  { id: "ellipse", icon: Circle },
  { id: "line", icon: Minus },
  { id: "arrow", icon: ArrowUpRight },
  { id: "highlight", icon: Highlighter },
  { id: "draw", icon: Pencil },
  { id: "note", icon: StickyNote },
  { id: "link", icon: Link2 },
];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MIN_DRAG = 0.8;
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

type Settings = {
  color: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
  text: string;
  url: string;
};
type PendingImage = { data: string; preview: string; ratio: number } | null;
type Creation = { start: [number, number]; current: [number, number]; points: [number, number][] };
type Moving = { id: string; origin: [number, number]; original: EditOp };

const DEFAULTS: Settings = {
  color: "#E53935",
  fill: "",
  strokeWidth: 2.5,
  fontSize: 16,
  text: "Text",
  url: "https://",
};

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageRatio(source: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image.naturalWidth / Math.max(image.naturalHeight, 1));
    image.onerror = () => resolve(1);
    image.src = source;
  });
}

function buildOp(
  tool: EditorTool,
  creation: Creation,
  page: number,
  settings: Settings,
  image: PendingImage,
  view: PageView,
): EditOp | null {
  const [x0, y0] = creation.start;
  const [x1, y1] = creation.current;
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  const dragged = width > MIN_DRAG || height > MIN_DRAG;
  const id = newId();
  switch (tool) {
    case "text":
      return {
        id,
        page,
        type: "text",
        x: x0,
        y: y0,
        text: settings.text || "Text",
        font: "noto-sans",
        size: settings.fontSize,
        color: settings.color,
        bold: false,
        align: "left",
        opacity: 1,
        rotation: 0,
      };
    case "edit_text":
      return dragged
        ? {
            id,
            page,
            type: "replace_text",
            x,
            y,
            width,
            height,
            text: "",
            font: "noto-sans",
            size: settings.fontSize,
            color: "#000000",
            bold: false,
            background: "#FFFFFF",
          }
        : null;
    case "note":
      return {
        id,
        page,
        type: "note",
        x: x0,
        y: y0,
        text: settings.text || "Note",
        color: "#FFEB3B",
      };
    case "image": {
      if (!image) return null;
      const boxWidth = dragged ? width : 25;
      const pageRatio = view.widthPt / view.heightPt;
      const boxHeight = dragged ? height : (boxWidth * pageRatio) / image.ratio;
      return {
        id,
        page,
        type: "image",
        x: dragged ? x : clamp(x0, 0, 100 - boxWidth),
        y: dragged ? y : clamp(y0, 0, 100 - boxHeight),
        width: boxWidth,
        height: Math.min(boxHeight, 100),
        image_data: image.data,
        preview: image.preview,
        opacity: 1,
        rotation: 0,
      };
    }
    case "rectangle":
    case "ellipse":
      return dragged
        ? {
            id,
            page,
            type: tool,
            x,
            y,
            width,
            height,
            stroke: settings.color,
            fill: settings.fill,
            stroke_width: settings.strokeWidth,
            opacity: 1,
          }
        : null;
    case "line":
    case "arrow":
      return dragged
        ? {
            id,
            page,
            type: "line",
            x1: x0,
            y1: y0,
            x2: x1,
            y2: y1,
            color: settings.color,
            stroke_width: settings.strokeWidth,
            arrow: tool === "arrow",
            opacity: 1,
          }
        : null;
    case "highlight":
      return dragged
        ? { id, page, type: "highlight", x, y, width, height, color: "#FFEB3B", opacity: 0.45 }
        : null;
    case "link":
      return dragged ? { id, page, type: "link", x, y, width, height, url: settings.url } : null;
    case "draw":
      return creation.points.length > 1
        ? {
            id,
            page,
            type: "draw",
            points: creation.points,
            color: settings.color,
            stroke_width: settings.strokeWidth,
            opacity: 1,
          }
        : null;
    default:
      return null;
  }
}

function OpView({
  op,
  view,
  selected,
  interactive,
  onPointerDown,
}: {
  op: EditOp;
  view: PageView;
  selected: boolean;
  interactive: boolean;
  onPointerDown: (event: PointerEvent, op: EditOp) => void;
}) {
  const px = (value: number, axis: "x" | "y") =>
    (value / 100) * (axis === "x" ? view.width : view.height);
  const ring = selected ? "outline outline-2 outline-offset-2 outline-primary" : "";
  const events = {
    onPointerDown: interactive ? (event: PointerEvent) => onPointerDown(event, op) : undefined,
    style: { pointerEvents: interactive ? ("auto" as const) : ("none" as const) },
  };
  switch (op.type) {
    case "find_replace":
      return null;
    case "replace_text":
      return (
        <div
          {...events}
          dir="auto"
          className={cn("absolute cursor-move overflow-hidden font-sans whitespace-pre", ring)}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: px(op.width, "x"),
            minHeight: px(op.height, "y"),
            background: op.background,
            color: op.color,
            fontSize: op.size * view.scale,
            lineHeight: 1.25,
            fontWeight: op.bold ? 700 : 400,
          }}
        >
          {op.text}
        </div>
      );
    case "text":
      return (
        <div
          {...events}
          dir="auto"
          className={cn("absolute cursor-move font-sans whitespace-pre", ring)}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            fontSize: op.size * view.scale,
            lineHeight: 1.25,
            color: op.color,
            fontWeight: op.bold ? 700 : 400,
            opacity: op.opacity,
            textAlign: op.align,
            transform: `rotate(${op.rotation}deg)`,
            transformOrigin: "top left",
          }}
        >
          {op.text}
        </div>
      );
    case "image":
      return (
        <img
          {...events}
          src={op.preview}
          alt=""
          draggable={false}
          className={cn("absolute cursor-move", ring)}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: px(op.width, "x"),
            height: px(op.height, "y"),
            opacity: op.opacity,
          }}
        />
      );
    case "note":
      return (
        <div
          {...events}
          title={op.text}
          className={cn(
            "absolute flex cursor-move items-center justify-center rounded-sm border border-black/40 bg-yellow-300 text-black",
            ring,
          )}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: 22,
            height: 22,
          }}
        >
          <StickyNote className="size-3.5" aria-hidden />
        </div>
      );
    case "link":
      return (
        <div
          {...events}
          className={cn(
            "absolute cursor-move border border-dashed border-blue-600 bg-blue-500/10",
            ring,
          )}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: px(op.width, "x"),
            height: px(op.height, "y"),
          }}
        />
      );
    case "highlight":
      return (
        <div
          {...events}
          className={cn("absolute cursor-move mix-blend-multiply", ring)}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: px(op.width, "x"),
            height: px(op.height, "y"),
            background: op.color,
            opacity: op.opacity,
          }}
        />
      );
    case "rectangle":
    case "ellipse":
      return (
        <div
          {...events}
          className={cn("absolute cursor-move", op.type === "ellipse" && "rounded-[50%]", ring)}
          style={{
            ...events.style,
            left: px(op.x, "x"),
            top: px(op.y, "y"),
            width: px(op.width, "x"),
            height: px(op.height, "y"),
            border: `${op.stroke_width * view.scale}px solid ${op.stroke}`,
            background: op.fill || "transparent",
            opacity: op.opacity,
            boxSizing: "border-box",
          }}
        />
      );
    case "line":
    case "draw": {
      const points: [number, number][] =
        op.type === "draw"
          ? op.points
          : [
              [op.x1, op.y1],
              [op.x2, op.y2],
            ];
      const path = points
        .map(([x, y], index) => `${index ? "L" : "M"}${px(x, "x")} ${px(y, "y")}`)
        .join(" ");
      const color = op.color;
      const [last, before] = [points[points.length - 1], points[points.length - 2]];
      let head = "";
      if (op.type === "line" && op.arrow && before) {
        const ax = px(last[0], "x");
        const ay = px(last[1], "y");
        const angle = Math.atan2(ay - px(before[1], "y"), ax - px(before[0], "x"));
        const size = op.stroke_width * view.scale * 5;
        head = `M${ax} ${ay} L${ax - size * Math.cos(angle - 0.45)} ${ay - size * Math.sin(angle - 0.45)} L${ax - size * Math.cos(angle + 0.45)} ${ay - size * Math.sin(angle + 0.45)} Z`;
      }
      return (
        <svg
          className="absolute inset-0 size-full overflow-visible"
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={op.stroke_width * view.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={op.opacity}
          />
          {head ? <path d={head} fill={color} opacity={op.opacity} /> : null}
          {selected ? (
            <path
              d={path}
              fill="none"
              stroke="var(--color-primary, #5B4BFF)"
              strokeDasharray="4 4"
            />
          ) : null}
          {interactive ? (
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: "stroke", cursor: "move" }}
              onPointerDown={(event) => onPointerDown(event, op)}
            />
          ) : null}
        </svg>
      );
    }
  }
}

export function useEditPdfPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_edit_pdf");
  const file = files[0];
  const { document, failed } = usePdfDocument(file);
  const [store, setStore] = useState<{ key?: string; history: History }>({
    history: EMPTY_HISTORY,
  });
  const [tool, setTool] = useState<EditorTool>("select");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [image, setImage] = useState<PendingImage>(null);
  const [imageError, setImageError] = useState(false);
  const [creation, setCreation] = useState<Creation | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [draft, setDraft] = useState<EditOp | null>(null);
  const [view, setView] = useState<PageView | null>(null);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchTotal, setMatchTotal] = useState<number | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const fileKey = file?.key;
  const history = store.key === fileKey ? store.history : EMPTY_HISTORY;
  const setHistory = useCallback(
    (update: (current: History) => History) =>
      setStore((current) => ({
        key: fileKey,
        history: update(current.key === fileKey ? current.history : EMPTY_HISTORY),
      })),
    [fileKey],
  );
  const ops = history.present;
  const page = pageIndex + 1;
  const pageCount = document?.numPages ?? file?.pageCount ?? 1;
  const selected = ops.find((op) => op.id === selectedId) ?? null;

  const apply = useCallback(
    (next: EditOp[]) => setHistory((current) => commit(current, next)),
    [setHistory],
  );

  const updateSelected = (patch: Partial<EditOp>) => {
    if (!selected) return;
    apply(ops.map((op) => (op.id === selected.id ? ({ ...op, ...patch } as EditOp) : op)));
  };

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    apply(ops.filter((op) => op.id !== selectedId));
    setSelectedId(null);
  }, [apply, ops, selectedId]);

  const position = (event: PointerEvent): [number, number] => {
    const bounds = overlay.current?.getBoundingClientRect();
    if (!bounds) return [0, 0];
    return [
      clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    ];
  };

  const onOverlayDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "image" && !image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event);
    setCreation({ start: point, current: point, points: [point] });
  };

  const onOverlayMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = position(event);
    if (moving) {
      const dx = point[0] - moving.origin[0];
      const dy = point[1] - moving.origin[1];
      setDraft(moveOp(moving.original, dx, dy));
      return;
    }
    if (!creation) return;
    setCreation({
      ...creation,
      current: point,
      points: tool === "draw" ? [...creation.points, point] : creation.points,
    });
  };

  const onOverlayUp = () => {
    if (moving) {
      if (draft) apply(ops.map((op) => (op.id === draft.id ? draft : op)));
      setMoving(null);
      setDraft(null);
      return;
    }
    if (!creation || !view) return;
    const created = buildOp(tool, creation, page, settings, image, view);
    setCreation(null);
    if (!created) return;
    if (created.type === "replace_text" && document) {
      void textInRegion(document, pageIndex, view.scale, view.width, view.height, created).then(
        (found) => {
          const filled: EditOp = {
            ...created,
            text: found?.text ?? "",
            size: found ? Math.max(found.size, 4) : created.size,
          };
          apply([...ops, filled]);
          setSelectedId(filled.id);
          setTool("select");
        },
      );
      return;
    }
    apply([...ops, created]);
    if (tool === "text" || tool === "note" || tool === "link") {
      setSelectedId(created.id);
      setTool("select");
    }
  };

  const onOpDown = (event: PointerEvent, op: EditOp) => {
    event.stopPropagation();
    setSelectedId(op.id);
    const host = overlay.current;
    if (!host) return;
    host.setPointerCapture(event.pointerId);
    const bounds = host.getBoundingClientRect();
    setMoving({
      id: op.id,
      origin: [
        clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
        clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
      ],
      original: op,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
    } else if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      setHistory(redo);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      if ((event.target as HTMLElement).tagName === "TEXTAREA") return;
      event.preventDefault();
      removeSelected();
    }
  };

  const onImageChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_IMAGE_BYTES || !/^image\/(png|jpe?g)$/.test(chosen.type)) {
      setImageError(true);
      return;
    }
    setImageError(false);
    const dataUrl = await readDataUrl(chosen);
    setImage({
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      preview: dataUrl,
      ratio: await imageRatio(dataUrl),
    });
    setTool("image");
  };

  const visible = useMemo(() => {
    const current = opsOnPage(ops, page).map((op) => (draft && draft.id === op.id ? draft : op));
    return current;
  }, [ops, page, draft]);

  const preview = useMemo(() => {
    if (!creation || !view || tool === "select") return null;
    return buildOp(tool, creation, page, settings, image, view);
  }, [creation, tool, page, settings, image, view]);

  useEffect(() => {
    let cancelled = false;
    if (!document || !find) return;
    const timer = window.setTimeout(() => {
      void countMatches(document, document.numPages, find, matchCase).then((total) => {
        if (!cancelled) setMatchTotal(total);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [document, find, matchCase]);

  const badLink = ops.some((op) => op.type === "link" && !SAFE_LINK.test(op.url));
  const problem = !ops.length ? t("problems.none") : badLink ? t("problems.badLink") : null;

  const main = (
    <div
      className="flex flex-col gap-3 outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-edit-pdf-canvas
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
          aria-label={t("previousPage")}
        >
          <ChevronLeft aria-hidden className="rtl:rotate-180" />
        </Button>
        <span className="text-sm" aria-live="polite">
          {t("pageOf", { page, count: pageCount })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
          onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
          aria-label={t("nextPage")}
        >
          <ChevronRight aria-hidden className="rtl:rotate-180" />
        </Button>
        <span className="ms-auto flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!history.past.length}
            onClick={() => setHistory(undo)}
            aria-label={t("undo")}
            data-edit-undo
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!history.future.length}
            onClick={() => setHistory(redo)}
            aria-label={t("redo")}
            data-edit-redo
          >
            <Redo2 aria-hidden />
          </Button>
        </span>
      </div>
      {failed ? (
        <p className="text-sm text-danger-strong" role="alert">
          {t("loadFailed")}
        </p>
      ) : (
        <PdfPageCanvas document={document} pageIndex={pageIndex} onView={setView}>
          {(pageView) => (
            <div
              ref={overlay}
              className={cn(
                "absolute inset-0 touch-none",
                tool === "select" ? "cursor-default" : "cursor-crosshair",
              )}
              onPointerDown={onOverlayDown}
              onPointerMove={onOverlayMove}
              onPointerUp={onOverlayUp}
              data-edit-overlay
            >
              {visible.map((op) => (
                <OpView
                  key={op.id}
                  op={op}
                  view={pageView}
                  selected={op.id === selectedId}
                  interactive={tool === "select"}
                  onPointerDown={onOpDown}
                />
              ))}
              {preview ? (
                <OpView
                  op={preview}
                  view={pageView}
                  selected={false}
                  interactive={false}
                  onPointerDown={onOpDown}
                />
              ) : null}
            </div>
          )}
        </PdfPageCanvas>
      )}
    </div>
  );

  const options = (
    <div className="flex flex-col gap-4" data-edit-pdf-panel>
      <div className="grid grid-cols-4 gap-1.5" role="toolbar" aria-label={t("tools")}>
        {TOOLS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={t(`tool.${id}`)}
            aria-label={t(`tool.${id}`)}
            aria-pressed={tool === id}
            data-edit-tool={id}
            onClick={() => {
              setTool(id);
              if (id !== "select") setSelectedId(null);
            }}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg border text-sm",
              tool === id
                ? "text-primary-strong border-primary bg-primary-subtle"
                : "border-border hover:bg-surface-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{t(`hint.${tool}`)}</p>

      {tool === "image" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-image" className="text-sm font-medium">
            {t("chooseImage")}
          </label>
          <Input
            id="edit-image"
            type="file"
            accept="image/png,image/jpeg"
            className="h-10"
            onChange={onImageChosen}
            data-edit-image
          />
          {imageError ? (
            <p className="text-xs text-danger-strong" role="alert">
              {t("imageRejected")}
            </p>
          ) : null}
        </div>
      ) : null}

      {tool === "text" || tool === "note" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-text" className="text-sm font-medium">
            {t("defaultText")}
          </label>
          <Input
            id="edit-text"
            value={settings.text}
            onChange={(event) => setSettings({ ...settings, text: event.target.value })}
          />
        </div>
      ) : null}
      {tool === "link" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-url" className="text-sm font-medium">
            {t("linkAddress")}
          </label>
          <Input
            id="edit-url"
            value={settings.url}
            onChange={(event) => setSettings({ ...settings, url: event.target.value })}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("color")}
          <input
            type="color"
            value={settings.color}
            onChange={(event) => setSettings({ ...settings, color: event.target.value })}
            className="h-9 w-full rounded-md border border-border"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("fill")}
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={settings.fill || "#ffffff"}
              onChange={(event) => setSettings({ ...settings, fill: event.target.value })}
              className="h-9 w-full rounded-md border border-border"
            />
            <button
              type="button"
              className="text-xs text-muted underline"
              onClick={() => setSettings({ ...settings, fill: "" })}
            >
              {t("noFill")}
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("strokeWidth")}
          <Input
            type="number"
            min={0.5}
            max={40}
            step={0.5}
            value={settings.strokeWidth}
            onChange={(event) =>
              setSettings({
                ...settings,
                strokeWidth: clamp(Number(event.target.value) || 1, 0.5, 40),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("fontSize")}
          <Input
            type="number"
            min={6}
            max={200}
            value={settings.fontSize}
            onChange={(event) =>
              setSettings({
                ...settings,
                fontSize: clamp(Number(event.target.value) || 12, 6, 200),
              })
            }
          />
        </label>
      </div>

      <fieldset
        className="flex flex-col gap-2 rounded-xl border border-border p-3"
        data-find-replace
      >
        <legend className="px-1 text-sm font-medium">{t("findTitle")}</legend>
        <Input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder={t("find")}
          aria-label={t("find")}
          dir="auto"
        />
        <Input
          value={replaceWith}
          onChange={(event) => setReplaceWith(event.target.value)}
          placeholder={t("replaceWith")}
          aria-label={t("replaceWith")}
          dir="auto"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => setMatchCase(event.target.checked)}
          />
          {t("matchCase")}
        </label>
        <p className="text-xs text-muted" aria-live="polite">
          {find ? t("matches", { count: matchTotal ?? 0 }) : t("replaceNote")}
        </p>
        <Button
          icon={<Replace />}
          type="button"
          size="sm"
          variant="outline"
          disabled={!find}
          data-find-apply
          onClick={() => {
            apply([
              ...ops,
              {
                id: newId(),
                page: 0,
                type: "find_replace",
                find,
                replace: replaceWith,
                match_case: matchCase,
                pages: "all",
                font: "noto-sans",
                color: "#000000",
                bold: false,
                background: "#FFFFFF",
              },
            ]);
            setFind("");
            setReplaceWith("");
          }}
        >
          {t("addReplacement")}
        </Button>
        {ops
          .filter((op) => op.type === "find_replace")
          .map((op) =>
            op.type === "find_replace" ? (
              <div key={op.id} className="flex items-center justify-between gap-2 text-xs">
                <span dir="auto">
                  {t("replacementItem", { find: op.find, replace: op.replace })}
                </span>
                <button
                  type="button"
                  className="text-danger-strong underline"
                  onClick={() => apply(ops.filter((entry) => entry.id !== op.id))}
                >
                  {t("delete")}
                </button>
              </div>
            ) : null,
          )}
      </fieldset>

      {selected ? (
        <fieldset
          className="flex flex-col gap-2 rounded-xl border border-border p-3"
          data-edit-selected
        >
          <legend className="px-1 text-sm font-medium">{t("selected")}</legend>
          {selected.type === "text" ||
          selected.type === "note" ||
          selected.type === "replace_text" ? (
            <textarea
              value={selected.text}
              onChange={(event) => updateSelected({ text: event.target.value })}
              rows={3}
              dir="auto"
              className="w-full rounded-md border border-border bg-surface p-2 text-sm"
              aria-label={t("defaultText")}
              data-edit-selected-text
            />
          ) : null}
          {selected.type === "text" || selected.type === "replace_text" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={4}
                max={300}
                value={selected.size}
                onChange={(event) =>
                  updateSelected({ size: clamp(Number(event.target.value) || 12, 4, 300) })
                }
                aria-label={t("fontSize")}
              />
              <input
                type="color"
                value={selected.color}
                onChange={(event) => updateSelected({ color: event.target.value })}
                className="h-10 w-full rounded-md border border-border"
                aria-label={t("color")}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.bold}
                  onChange={(event) => updateSelected({ bold: event.target.checked })}
                />
                {t("bold")}
              </label>
            </div>
          ) : null}
          {selected.type === "link" ? (
            <Input
              value={selected.url}
              onChange={(event) => updateSelected({ url: event.target.value })}
              aria-label={t("linkAddress")}
            />
          ) : null}
          {selected.type === "rectangle" || selected.type === "ellipse" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="color"
                value={selected.stroke}
                onChange={(event) => updateSelected({ stroke: event.target.value })}
                className="h-10 w-full rounded-md border border-border"
                aria-label={t("color")}
              />
              <input
                type="color"
                value={selected.fill || "#ffffff"}
                onChange={(event) => updateSelected({ fill: event.target.value })}
                className="h-10 w-full rounded-md border border-border"
                aria-label={t("fill")}
              />
            </div>
          ) : null}
          {selected.type === "line" || selected.type === "draw" ? (
            <input
              type="color"
              value={selected.color}
              onChange={(event) => updateSelected({ color: event.target.value })}
              className="h-10 w-full rounded-md border border-border"
              aria-label={t("color")}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={removeSelected}
            data-edit-delete
          >
            <Trash2 aria-hidden />
            {t("delete")}
          </Button>
        </fieldset>
      ) : null}
    </div>
  );

  return {
    main,
    options,
    payload: { operations: toPayload(ops) },
    problem,
    summary: ops.length && !problem ? t("summary", { count: ops.length }) : null,
  };
}
