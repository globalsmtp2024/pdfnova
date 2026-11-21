"use client";

import { RotateCw, Scissors, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";

export type PageGridMode = "select" | "delete";

export type PageGridProps = {
  fileId: string | null;
  pageCount: number;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  rotations?: Record<number, number>;
  onRotatePage?: (page: number) => void;
  mode?: PageGridMode;
  splitMarkers?: Set<number>;
  onToggleSplitMarker?: (afterPage: number) => void;
  label: string;
};

const ZOOM_WIDTHS = [96, 128, 160, 224];
const THUMBNAIL_WIDTHS = [128, 160, 192, 256];
const VIRTUALIZE_AFTER = 200;
const MAX_THUMBNAIL_RETRIES = 2;

function Thumbnail({
  fileId,
  page,
  width,
  rotation,
}: {
  fileId: string | null;
  page: number;
  width: number;
  rotation: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > MAX_THUMBNAIL_RETRIES;
  useEffect(() => {
    const element = holder.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  const showImage = visible && fileId && !failed;
  return (
    <div
      ref={holder}
      className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-muted p-1.5"
    >
      {showImage ? (
        <img
          src={`/api/v1/files/${fileId}/pages/${page + 1}/thumbnail?width=${width}${attempt ? `&attempt=${attempt}` : ""}`}
          alt=""
          draggable={false}
          onError={() => {
            window.setTimeout(() => setAttempt((current) => current + 1), 600 * 2 ** attempt);
          }}
          className="max-h-full max-w-full object-contain shadow-soft ring-1 ring-border-strong transition-transform duration-300"
          style={{
            transform: `rotate(${rotation}deg) scale(${rotation % 180 === 0 ? 1 : 0.75})`,
          }}
        />
      ) : (
        <span
          className={cn(
            "font-display text-2xl font-semibold text-muted",
            visible ? "" : "animate-pulse",
          )}
          aria-hidden
        >
          {page + 1}
        </span>
      )}
    </div>
  );
}

export function PageGrid({
  fileId,
  pageCount,
  selected,
  onSelectedChange,
  rotations = {},
  onRotatePage,
  mode = "select",
  splitMarkers,
  onToggleSplitMarker,
  label,
}: PageGridProps) {
  const t = useTranslations("pageGrid");
  const [zoom, setZoom] = useState(1);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focused, setFocused] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [rectangle, setRectangle] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const grid = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<number, HTMLElement>());
  const dragStart = useRef<{ x: number; y: number; additive: boolean; base: Set<number> } | null>(
    null,
  );
  const pages = Array.from({ length: pageCount }, (_, index) => index);
  const virtualize = pageCount > VIRTUALIZE_AFTER;

  const commit = useCallback(
    (next: Set<number>) => {
      onSelectedChange(next);
      setAnnouncement(t("selectedCount", { count: next.size, total: pageCount }));
    },
    [onSelectedChange, pageCount, t],
  );

  const toggle = (
    page: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    const next = new Set(selected);
    if (event.shiftKey && anchor !== null) {
      const [low, high] = anchor < page ? [anchor, page] : [page, anchor];
      for (let index = low; index <= high; index += 1) next.add(index);
    } else if (event.ctrlKey || event.metaKey || mode === "delete" || selected.size > 0) {
      if (next.has(page)) next.delete(page);
      else next.add(page);
      setAnchor(page);
    } else {
      next.add(page);
      setAnchor(page);
    }
    commit(next);
  };

  const quick = (kind: "all" | "none" | "odd" | "even" | "invert") => {
    if (kind === "all") commit(new Set(pages));
    else if (kind === "none") commit(new Set());
    else if (kind === "odd") commit(new Set(pages.filter((page) => page % 2 === 0)));
    else if (kind === "even") commit(new Set(pages.filter((page) => page % 2 === 1)));
    else commit(new Set(pages.filter((page) => !selected.has(page))));
  };

  const columns = () => {
    const element = grid.current;
    const first = cells.current.get(0);
    if (!element || !first) return 1;
    return Math.max(1, Math.round(element.clientWidth / first.getBoundingClientRect().width));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const moves: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: columns(),
      ArrowUp: -columns(),
      Home: -pageCount,
      End: pageCount,
    };
    if (event.key in moves) {
      event.preventDefault();
      const target = Math.min(Math.max(focused + moves[event.key], 0), pageCount - 1);
      setFocused(target);
      cells.current.get(target)?.focus();
      if (event.shiftKey) toggle(target, { shiftKey: true, ctrlKey: false, metaKey: false });
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(focused, { shiftKey: event.shiftKey, ctrlKey: true, metaKey: false });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      quick("all");
    }
    if (event.key.toLowerCase() === "r" && onRotatePage) {
      event.preventDefault();
      onRotatePage(focused);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragStart.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top + event.currentTarget.scrollTop,
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      base: new Set(selected),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top + event.currentTarget.scrollTop;
    const box = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    };
    if (box.w < 6 && box.h < 6) return;
    setRectangle(box);
    const next = start.additive ? new Set(start.base) : new Set<number>();
    for (const [page, cell] of cells.current) {
      const rect = cell.getBoundingClientRect();
      const left = rect.left - bounds.left;
      const top = rect.top - bounds.top + event.currentTarget.scrollTop;
      const hit =
        left < box.x + box.w &&
        left + rect.width > box.x &&
        top < box.y + box.h &&
        top + rect.height > box.y;
      if (hit) next.add(page);
    }
    onSelectedChange(next);
  };

  const onPointerUp = () => {
    if (rectangle) setAnnouncement(t("selectedCount", { count: selected.size, total: pageCount }));
    dragStart.current = null;
    setRectangle(null);
  };

  const width = ZOOM_WIDTHS[zoom];
  return (
    <div className="flex flex-col gap-3" data-page-grid>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "none", "odd", "even", "invert"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => quick(kind)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:border-primary/50 hover:text-foreground"
          >
            {t(`quick.${kind}`)}
          </button>
        ))}
        <label className="ms-auto flex items-center gap-2 text-xs text-muted">
          {t("zoom")}
          <input
            type="range"
            min={0}
            max={ZOOM_WIDTHS.length - 1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-24 accent-(--primary)"
          />
        </label>
      </div>
      <p className="text-xs text-muted" aria-hidden>
        {t("selectedCount", { count: selected.size, total: pageCount })}
      </p>
      <div
        ref={grid}
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          "relative grid max-h-[70vh] touch-pan-y gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 select-none",
          onToggleSplitMarker && "gap-x-6 px-5",
        )}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${width}px, 1fr))` }}
      >
        {pages.map((page) => {
          const isSelected = selected.has(page);
          const rotation = rotations[page] ?? 0;
          const marked = mode === "delete" && isSelected;
          return (
            <div
              key={page}
              className="relative"
              style={
                virtualize
                  ? {
                      contentVisibility: "auto",
                      containIntrinsicSize: `${width}px ${width * 1.4}px`,
                    }
                  : undefined
              }
            >
              <div
                ref={(element) => {
                  if (element) cells.current.set(page, element);
                  else cells.current.delete(page);
                }}
                role="option"
                aria-selected={isSelected}
                aria-label={t("pageLabel", { page: page + 1, total: pageCount })}
                tabIndex={page === focused ? 0 : -1}
                data-page={page + 1}
                onFocus={() => setFocused(page)}
                onClick={(event) => toggle(page, event)}
                className={cn(
                  "group relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--primary)",
                  isSelected
                    ? marked
                      ? "border-danger bg-danger/5"
                      : "border-primary bg-primary-subtle/50"
                    : "border-transparent hover:border-border-strong",
                )}
              >
                <div className="relative">
                  <Thumbnail
                    fileId={fileId}
                    page={page}
                    width={THUMBNAIL_WIDTHS[zoom]}
                    rotation={rotation}
                  />
                  {marked ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-danger/25">
                      <Trash2 className="size-7 text-danger-strong" aria-hidden />
                      <span className="absolute inset-x-2 top-1/2 h-0.5 -rotate-12 bg-danger-strong" />
                    </div>
                  ) : null}
                  {rotation ? (
                    <span className="absolute end-1 top-1 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      {rotation}°
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-medium tabular-nums">{page + 1}</span>
                  {onRotatePage ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRotatePage(page);
                      }}
                      aria-label={t("rotatePage", { page: page + 1 })}
                      className="rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground"
                    >
                      <RotateCw className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
              {onToggleSplitMarker && page < pageCount - 1 ? (
                <button
                  type="button"
                  onClick={() => onToggleSplitMarker(page)}
                  aria-pressed={splitMarkers?.has(page) ?? false}
                  aria-label={t("splitAfter", { page: page + 1 })}
                  data-split-after={page + 1}
                  className={cn(
                    "absolute -end-6 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border shadow-soft transition-colors",
                    splitMarkers?.has(page)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted opacity-60 hover:opacity-100",
                  )}
                >
                  <Scissors className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
        {rectangle ? (
          <div
            className="pointer-events-none absolute rounded border border-primary bg-primary/10"
            style={{ left: rectangle.x, top: rectangle.y, width: rectangle.w, height: rectangle.h }}
          />
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
