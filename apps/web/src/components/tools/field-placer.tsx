"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  PdfPageCanvas,
  type PageView,
  type PdfDocumentHandle,
} from "@/components/tools/pdf-page-canvas";
import { Button } from "@/components/ui/button";
import { clamp } from "@/lib/editor-ops";
import { cn } from "@/lib/utils";

export type PlacedBox = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: string;
};

type Drag =
  | { mode: "create"; start: [number, number]; current: [number, number] }
  | { mode: "move"; id: string; origin: [number, number]; original: PlacedBox }
  | null;

const MIN_DRAG = 1;

export function FieldPlacer<T extends PlacedBox>({
  document,
  pageCount,
  fields,
  onChange,
  placing,
  create,
  defaultSize,
  selectedId,
  onSelect,
  renderLabel,
  colorFor,
}: {
  document: PdfDocumentHandle | null;
  pageCount: number;
  fields: T[];
  onChange: (fields: T[]) => void;
  placing: string | null;
  create: (kind: string, page: number, box: Omit<PlacedBox, "id" | "kind" | "page">) => T;
  defaultSize: (kind: string) => { width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderLabel: (field: T) => ReactNode;
  colorFor?: (field: T) => string;
}) {
  const t = useTranslations("field_placer");
  const [pageIndex, setPageIndex] = useState(0);
  const [drag, setDrag] = useState<Drag>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const page = pageIndex + 1;

  const point = (event: PointerEvent): [number, number] => {
    const bounds = host.current?.getBoundingClientRect();
    if (!bounds) return [0, 0];
    return [
      clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    ];
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!placing) {
      onSelect(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    setDrag({ mode: "create", start, current: start });
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const current = point(event);
    if (drag.mode === "create") {
      setDrag({ ...drag, current });
      return;
    }
    const dx = current[0] - drag.origin[0];
    const dy = current[1] - drag.origin[1];
    const original = drag.original as T;
    setDraft({
      ...original,
      x: clamp(original.x + dx, 0, 100 - original.width),
      y: clamp(original.y + dy, 0, 100 - original.height),
    });
  };

  const onUp = () => {
    if (!drag) return;
    if (drag.mode === "move") {
      if (draft) onChange(fields.map((field) => (field.id === draft.id ? draft : field)));
      setDraft(null);
      setDrag(null);
      return;
    }
    if (placing) {
      const [x0, y0] = drag.start;
      const [x1, y1] = drag.current;
      const dragged = Math.abs(x1 - x0) > MIN_DRAG && Math.abs(y1 - y0) > MIN_DRAG;
      const size = defaultSize(placing);
      const box = dragged
        ? {
            x: Math.min(x0, x1),
            y: Math.min(y0, y1),
            width: Math.abs(x1 - x0),
            height: Math.abs(y1 - y0),
          }
        : {
            x: clamp(x0, 0, 100 - size.width),
            y: clamp(y0, 0, 100 - size.height),
            width: size.width,
            height: size.height,
          };
      const created = create(placing, page, box);
      onChange([...fields, created]);
      onSelect(created.id);
    }
    setDrag(null);
  };

  const creating =
    drag && drag.mode === "create"
      ? {
          x: Math.min(drag.start[0], drag.current[0]),
          y: Math.min(drag.start[1], drag.current[1]),
          width: Math.abs(drag.current[0] - drag.start[0]),
          height: Math.abs(drag.current[1] - drag.start[1]),
        }
      : null;

  const box = (field: T, view: PageView) => (
    <div
      key={field.id}
      onPointerDown={(event) => {
        if (placing) return;
        event.stopPropagation();
        onSelect(field.id);
        host.current?.setPointerCapture(event.pointerId);
        setDrag({ mode: "move", id: field.id, origin: point(event), original: field });
      }}
      className={cn(
        "absolute flex items-center overflow-hidden border-2 px-1 text-[11px] font-medium",
        placing ? "pointer-events-none" : "cursor-move",
        field.id === selectedId ? "outline outline-2 outline-offset-2 outline-primary" : "",
      )}
      style={{
        left: (field.x / 100) * view.width,
        top: (field.y / 100) * view.height,
        width: (field.width / 100) * view.width,
        height: (field.height / 100) * view.height,
        borderColor: colorFor?.(field) ?? "#5B4BFF",
        background: `${colorFor?.(field) ?? "#5B4BFF"}22`,
        color: colorFor?.(field) ?? "#3B2FCC",
      }}
    >
      {renderLabel(field)}
    </div>
  );

  return (
    <div className="flex flex-col gap-3" data-field-placer>
      <div className="flex items-center gap-2">
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
      </div>
      <PdfPageCanvas document={document} pageIndex={pageIndex}>
        {(view) => (
          <div
            ref={host}
            className={cn("absolute inset-0 touch-none", placing ? "cursor-crosshair" : "")}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            data-field-overlay
          >
            {fields
              .filter((field) => field.page === page)
              .map((field) => box(draft && draft.id === field.id ? draft : field, view))}
            {creating ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                style={{
                  left: (creating.x / 100) * view.width,
                  top: (creating.y / 100) * view.height,
                  width: (creating.width / 100) * view.width,
                  height: (creating.height / 100) * view.height,
                }}
              />
            ) : null}
          </div>
        )}
      </PdfPageCanvas>
    </div>
  );
}
