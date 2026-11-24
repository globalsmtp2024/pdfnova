"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownUp,
  ArrowUpDown,
  Copy,
  FilePlus2,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  organizePayload as buildPayload,
  pagesForFile,
  record,
  redo,
  undo,
  type OrganizeAction,
  type OrganizeHistory,
  type OrganizePage,
} from "@/components/tools/organize-state";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "organize-draft";

export type OrganizeController = {
  pages: OrganizePage[];
  history: OrganizeHistory;
  dispatch: (action: OrganizeAction) => void;
  undo: () => void;
  redo: () => void;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  announcement: string;
  announce: (message: string) => void;
  fileKeys: string[];
};

function readDraft(signature: string): OrganizePage[] | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { signature: string; pages: OrganizePage[] };
    return parsed.signature === signature ? parsed.pages : null;
  } catch {
    return null;
  }
}

function writeDraft(signature: string, pages: OrganizePage[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, pages }));
  } catch {
    return;
  }
}

export function useOrganizeState(files: LocalFile[]): OrganizeController {
  const [history, setHistory] = useState<OrganizeHistory>({ past: [], present: [], future: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const loaded = useRef(new Set<string>());
  const ready = files.filter((file) => file.uploadId && file.pageCount);
  const signature = ready.map((file) => `${file.uploadId}:${file.pageCount}`).join("|");
  const fileKeys = files.map((file) => file.key);

  useEffect(() => {
    const fresh = files.filter(
      (file) => file.uploadId && file.pageCount && !loaded.current.has(file.key),
    );
    if (!fresh.length) return;
    const restored = loaded.current.size === 0 ? readDraft(signature) : null;
    fresh.forEach((file) => loaded.current.add(file.key));
    setHistory((current) => {
      if (restored && ready.length === fresh.length)
        return { past: [], present: restored, future: [] };
      const added = fresh.flatMap((file) =>
        pagesForFile(file.key, files.indexOf(file), file.pageCount ?? 0),
      );
      return current.present.length === 0 && current.past.length === 0
        ? { past: [], present: added, future: [] }
        : record(current, { type: "append", pages: added });
    });
  }, [files, ready.length, signature]);

  useEffect(() => {
    if (history.present.length) writeDraft(signature, history.present);
  }, [history.present, signature]);

  const dispatch = useCallback((action: OrganizeAction) => {
    setHistory((current) => record(current, action));
  }, []);

  return {
    pages: history.present,
    history,
    dispatch,
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
    selected,
    setSelected,
    announcement,
    announce: setAnnouncement,
    fileKeys,
  };
}

export function organizePayload(pages: OrganizePage[], fileKeys: string[] = []) {
  return buildPayload(pages, fileKeys);
}

function SortablePage({
  page,
  index,
  file,
  selected,
  onToggle,
  label,
}: {
  page: OrganizePage;
  index: number;
  file: LocalFile | undefined;
  selected: boolean;
  onToggle: (additive: boolean) => void;
  label: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none", isDragging && "z-10 opacity-80")}
      data-organize-page={index + 1}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={label}
        aria-pressed={selected}
        onClick={(event) => onToggle(event.ctrlKey || event.metaKey || event.shiftKey)}
        className={cn(
          "flex cursor-grab flex-col gap-1 rounded-xl border-2 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-(--primary)",
          selected
            ? "border-primary bg-primary-subtle/50"
            : "border-transparent hover:border-border-strong",
          isDragging && "shadow-lifted",
        )}
      >
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-surface-muted p-1.5">
          {page.source === "file" && file?.uploadId && !file.encrypted ? (
            <img
              src={`/api/v1/files/${file.uploadId}/pages/${page.page}/thumbnail?width=160`}
              alt=""
              loading="lazy"
              draggable={false}
              className="max-h-full max-w-full object-contain shadow-soft ring-1 ring-border-strong transition-transform duration-300"
              style={{
                transform: `rotate(${page.rotate}deg) scale(${page.rotate % 180 === 0 ? 1 : 0.75})`,
              }}
            />
          ) : (
            <span
              className="flex aspect-[3/4] h-full items-center justify-center bg-surface text-xs text-muted ring-1 ring-border-strong"
              style={{
                transform: `rotate(${page.rotate}deg) scale(${page.rotate % 180 === 0 ? 1 : 0.75})`,
              }}
            >
              {page.source === "blank" ? "" : page.page}
            </span>
          )}
        </div>
        <span className="truncate px-0.5 text-xs tabular-nums">
          {index + 1}
          {page.source === "file" ? <span className="text-muted"> · {page.page}</span> : null}
        </span>
      </div>
    </li>
  );
}

export function OrganizeEditor({
  state,
  files,
}: {
  state: OrganizeController;
  files: LocalFile[];
}) {
  const t = useTranslations("pageTools.organize");
  const [position, setPosition] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byKey = new Map(files.map((file) => [file.key, file]));
  const { pages, selected, setSelected, dispatch, announce } = state;
  const chosen = [...selected].filter((id) => pages.some((page) => page.id === id));
  const targets = chosen.length ? chosen : [];

  const positionOf = (id: string | number) => pages.findIndex((page) => page.id === id) + 1;

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = pages.findIndex((page) => page.id === event.active.id);
    const to = pages.findIndex((page) => page.id === event.over?.id);
    dispatch({ type: "move", from, to });
    announce(t("moved", { from: from + 1, to: to + 1 }));
  };

  const toggle = (id: string, additive: boolean) => {
    const next = additive ? new Set(selected) : new Set<string>();
    if (selected.has(id) && (additive || selected.size === 1)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const lastSelectedIndex = Math.max(
    -1,
    ...targets.map((id) => pages.findIndex((page) => page.id === id)),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        state.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!pages.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {t("waiting")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-organize-editor>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={state.undo}
          disabled={!state.history.past.length}
          aria-label={t("undo")}
        >
          <Undo2 className="flip-rtl" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={state.redo}
          disabled={!state.history.future.length}
          aria-label={t("redo")}
        >
          <Redo2 className="flip-rtl" aria-hidden />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          disabled={!targets.length}
          onClick={() => dispatch({ type: "rotate", ids: targets, delta: 270 })}
          aria-label={t("rotateLeft")}
        >
          <RotateCcw aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!targets.length}
          onClick={() => dispatch({ type: "rotate", ids: targets, delta: 90 })}
          aria-label={t("rotateRight")}
        >
          <RotateCw aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!targets.length}
          onClick={() => dispatch({ type: "duplicate", ids: targets })}
          aria-label={t("duplicate")}
        >
          <Copy aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!targets.length || targets.length >= pages.length}
          onClick={() => {
            dispatch({ type: "delete", ids: targets });
            announce(t("deleted", { count: targets.length }));
            setSelected(new Set());
          }}
          aria-label={t("delete")}
          data-organize-delete
        >
          <Trash2 aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            dispatch({
              type: "insertBlank",
              after: lastSelectedIndex >= 0 ? lastSelectedIndex : pages.length - 1,
            })
          }
        >
          <FilePlus2 aria-hidden />
          {t("blank")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "reverse" })}>
          <ArrowDownUp aria-hidden />
          {t("reverse")}
        </Button>
        <Button
          icon={<ArrowUpDown />}
          size="sm"
          variant="ghost"
          onClick={() => dispatch({ type: "sortOriginal" })}
        >
          {t("sortOriginal")}
        </Button>
        {targets.length ? (
          <form
            className="ms-auto flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const target = Number(position);
              if (!Number.isInteger(target) || target < 1) return;
              dispatch({ type: "moveTo", ids: targets, position: target - 1 });
              announce(t("movedTo", { count: targets.length, position: target }));
              setPosition("");
            }}
          >
            <label htmlFor="organize-position" className="text-xs text-muted">
              {t("moveTo")}
            </label>
            <Input
              id="organize-position"
              dir="ltr"
              className="h-8 w-16"
              inputMode="numeric"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
            />
          </form>
        ) : null}
      </div>
      <p className="text-xs text-muted">{t("selectionHint", { count: targets.length })}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t("dragInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("pickedUp", { position: positionOf(active.id) }),
            onDragOver: ({ over }) =>
              over ? t("over", { position: positionOf(over.id) }) : t("notOver"),
            onDragEnd: ({ over }) =>
              over ? t("dropped", { position: positionOf(over.id) }) : t("cancelled"),
            onDragCancel: () => t("cancelled"),
          },
        }}
      >
        <SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
          <ul
            className="grid max-h-[70vh] grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3"
            aria-label={t("listLabel")}
          >
            {pages.map((page, index) => (
              <SortablePage
                key={page.id}
                page={page}
                index={index}
                file={byKey.get(page.fileKey)}
                selected={selected.has(page.id)}
                onToggle={(additive) => toggle(page.id, additive)}
                label={
                  page.source === "blank"
                    ? t("blankLabel", { position: index + 1 })
                    : t("pageLabel", {
                        position: index + 1,
                        page: page.page,
                        name: byKey.get(page.fileKey)?.name ?? "",
                      })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="sr-only" aria-live="polite">
        {state.announcement}
      </p>
    </div>
  );
}
