"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isImageFile, isPdfFile, pdfPreview } from "@/lib/pdf-preview";
import { cn, formatBytes } from "@/lib/utils";

function useThumbnail(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let active = true;
    let objectUrl: string | null = null;
    if (isImageFile(file)) {
      objectUrl = URL.createObjectURL(file);
      const created = objectUrl;
      queueMicrotask(() => {
        if (active) setPreview({ file, url: created });
      });
    } else if (isPdfFile(file)) {
      void pdfPreview(file).then((result) => {
        if (active && result) setPreview({ file, url: result.dataUrl });
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return preview && preview.file === file ? preview.url : null;
}

export function FileThumbnail({ entry }: { entry: LocalFile }) {
  const url = useThumbnail(entry.file);
  const Icon =
    entry.file === null ? Link2 : entry.file && isImageFile(entry.file) ? ImageIcon : FileText;
  return (
    <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted">
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          unoptimized
          sizes="48px"
          className="object-cover object-top"
          draggable={false}
        />
      ) : (
        <Icon className="size-5 text-muted" aria-hidden />
      )}
    </span>
  );
}

export function FileCard({
  entry,
  index,
  total,
  onMove,
  onRemove,
  onRetry,
  children,
}: {
  entry: LocalFile;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("toolPage");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.key });
  const fraction = entry.size ? entry.uploaded / entry.size : 0;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-file-card={entry.name}
      className={cn(
        "rounded-xl border bg-surface p-3 transition-shadow",
        entry.status === "error" ? "border-danger/40" : "border-border",
        isDragging && "relative z-10 shadow-floating ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="cursor-grab touch-none rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground active:cursor-grabbing"
          aria-label={t("dragToReorder", { name: entry.name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <FileThumbnail entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={entry.name}>
            {entry.name}
          </p>
          <p className="text-xs text-muted">
            {formatBytes(entry.size)}
            {entry.pageCount ? ` · ${t("pages", { count: entry.pageCount })}` : ""}
            {entry.status === "uploading"
              ? ` · ${t("uploading", { percent: Math.round(fraction * 100) })}`
              : ""}
            {entry.status === "queued" ? ` · ${t("waiting")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={t("moveUp", { name: entry.name })}
          >
            <ChevronUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={t("moveDown", { name: entry.name })}
          >
            <ChevronDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onRemove}
            aria-label={t("remove", { name: entry.name })}
          >
            <X aria-hidden />
          </Button>
        </div>
      </div>
      {entry.status === "uploading" || entry.status === "queued" ? (
        <Progress
          className="mt-3 h-1.5"
          value={fraction}
          label={t("uploading", { percent: Math.round(fraction * 100) })}
        />
      ) : null}
      {entry.status === "error" ? (
        <div
          className="mt-2 flex items-center justify-between gap-2 text-xs text-danger-strong"
          role="alert"
        >
          <span className="flex items-center gap-1.5">
            <CircleAlert className="size-3.5" aria-hidden />
            {entry.error}
          </span>
          {entry.file ? (
            <Button variant="link" size="sm" className="h-auto text-xs" onClick={onRetry}>
              <RefreshCw aria-hidden />
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {entry.status === "ready" ? children : null}
    </div>
  );
}
