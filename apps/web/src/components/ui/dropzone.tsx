"use client";

import { CircleAlert, LoaderCircle, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn, formatBytes } from "@/lib/utils";

export type RejectedFile = { file: File; reason: string };
export type DropzoneState = "idle" | "uploading" | "error";

export type DropzoneProps = {
  onFiles: (files: File[]) => void;
  onReject?: (rejected: RejectedFile[]) => void;
  accept?: string[];
  multiple?: boolean;
  maxSizeBytes?: number;
  disabled?: boolean;
  title?: string;
  subtitle?: ReactNode;
  className?: string;
  size?: "hero" | "compact";
  state?: DropzoneState;
  chips?: string[];
};

function matchesAccept(file: File, accept: string[]): boolean {
  if (accept.length === 0) return true;
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (normalized.startsWith(".")) return name.endsWith(normalized);
    if (normalized.endsWith("/*")) return file.type.startsWith(normalized.slice(0, -1));
    return file.type === normalized;
  });
}

export function partitionFiles(
  files: File[],
  accept: string[],
  maxSizeBytes: number | undefined,
): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    if (!matchesAccept(file, accept)) {
      rejected.push({ file, reason: "This file type is not supported here." });
    } else if (file.size === 0) {
      rejected.push({ file, reason: "This file is empty." });
    } else if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
      rejected.push({ file, reason: `This file is larger than ${formatBytes(maxSizeBytes)}.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function Dropzone({
  onFiles,
  onReject,
  accept = [],
  multiple = true,
  maxSizeBytes,
  disabled = false,
  title,
  subtitle,
  className,
  size = "compact",
  state = "idle",
  chips = [],
}: DropzoneProps) {
  const t = useTranslations("toolPage");
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const descriptionId = useId();

  const handleFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || disabled) return;
      const files = Array.from(list).slice(0, multiple ? undefined : 1);
      const { accepted, rejected } = partitionFiles(files, accept, maxSizeBytes);
      if (rejected.length) onReject?.(rejected);
      if (accepted.length) onFiles(accepted);
    },
    [accept, disabled, maxSizeBytes, multiple, onFiles, onReject],
  );

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current += 1;
    if (!disabled) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = Math.max(depth.current - 1, 0);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const Icon = state === "uploading" ? LoaderCircle : state === "error" ? CircleAlert : UploadCloud;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-describedby={descriptionId}
      data-dragging={dragging || undefined}
      data-state={state}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-(--radius-card) border-2 border-dashed border-border-strong bg-surface text-center transition-[border-color,background-color,transform,box-shadow] duration-200 ease-(--ease-spring)",
        "hover:border-primary/60 hover:bg-primary-subtle/40",
        "data-dragging:scale-[1.01] data-dragging:border-primary data-dragging:bg-primary-subtle/60 data-dragging:shadow-lifted",
        "data-[state=error]:border-danger/60 data-[state=uploading]:border-primary/50",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
        size === "hero" ? "min-h-64 px-6 py-12 sm:min-h-80" : "min-h-44 px-4 py-8",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-data-dragging:opacity-100"
        style={{
          background:
            "radial-gradient(circle at center, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%)",
        }}
      />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-2xl text-white shadow-lifted transition-transform duration-300 ease-(--ease-spring) group-hover:-translate-y-1 group-data-dragging:-translate-y-1.5 group-data-dragging:scale-110",
          state === "error" ? "bg-danger" : "bg-cta-gradient",
          size === "hero" ? "size-16" : "size-12",
        )}
        aria-hidden
      >
        <Icon
          className={cn(
            size === "hero" ? "size-8" : "size-6",
            state === "uploading" && "animate-spin",
          )}
        />
      </span>
      <span
        className={cn(
          "relative font-display font-semibold text-foreground",
          size === "hero" ? "text-h3" : "text-base",
        )}
      >
        {dragging ? t("dropDragging") : title}
      </span>
      <span id={descriptionId} className="relative max-w-md text-sm text-muted">
        {subtitle}
      </span>
      {chips.length ? (
        <span className="relative flex flex-wrap justify-center gap-1.5" aria-hidden>
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-muted"
            >
              {chip}
            </span>
          ))}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        multiple={multiple}
        accept={accept.join(",") || undefined}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
