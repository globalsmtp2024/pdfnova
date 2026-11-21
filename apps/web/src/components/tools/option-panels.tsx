"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";

export type Rotation = 0 | 90 | 180 | 270;
export type PerFileOptions = { pages: string; rotate: Rotation };

export type MergeState = {
  addBookmarks: boolean;
  keepOutline: boolean;
  outputName: string;
  perFile: Record<string, PerFileOptions>;
};

export const DEFAULT_PER_FILE: PerFileOptions = { pages: "", rotate: 0 };

export const DEFAULT_MERGE_STATE: MergeState = {
  addBookmarks: true,
  keepOutline: true,
  outputName: "merged.pdf",
  perFile: {},
};

export type MergePresetId = "all" | "firstPages" | "noBookmarks";

export function applyMergePreset(
  preset: MergePresetId,
  state: MergeState,
  files: LocalFile[],
): MergeState {
  if (preset === "all") {
    return { ...state, addBookmarks: true, keepOutline: true, perFile: {} };
  }
  if (preset === "firstPages") {
    return {
      ...state,
      perFile: Object.fromEntries(
        files.map((entry) => [
          entry.key,
          { ...(state.perFile[entry.key] ?? DEFAULT_PER_FILE), pages: "1" },
        ]),
      ),
    };
  }
  return { ...state, addBookmarks: false, keepOutline: false };
}

export function mergeOptionsPayload(
  state: MergeState,
  files: LocalFile[],
): Record<string, unknown> {
  return {
    add_bookmarks: state.addBookmarks,
    keep_existing_bookmarks: state.keepOutline,
    output_name: state.outputName.trim() || "merged.pdf",
    files: files.map((entry) => {
      const options = state.perFile[entry.key] ?? DEFAULT_PER_FILE;
      return {
        pages: options.pages.trim() || null,
        rotate: options.rotate,
        bookmark_title: entry.name.replace(/\.pdf$/i, ""),
      };
    }),
  };
}

export function MergePerFileControls({
  file,
  value,
  onChange,
}: {
  file: LocalFile;
  value: PerFileOptions;
  onChange: (next: PerFileOptions) => void;
}) {
  const t = useTranslations("toolPage");
  const pagesId = `pages-${file.key}`;
  const rotateId = `rotate-${file.key}`;
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 ps-9">
      <div>
        <label htmlFor={pagesId} className="sr-only">
          {t("pagesLabel", { name: file.name })}
        </label>
        <Input
          id={pagesId}
          className="h-9"
          placeholder={
            file.pageCount
              ? t("pagesPlaceholder", { count: file.pageCount })
              : t("pagesPlaceholderUnknown")
          }
          value={value.pages}
          onChange={(event) => onChange({ ...value, pages: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor={rotateId} className="sr-only">
          {t("rotateLabel", { name: file.name })}
        </label>
        <select
          id={rotateId}
          className="h-9 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
          value={value.rotate}
          onChange={(event) =>
            onChange({ ...value, rotate: Number(event.target.value) as Rotation })
          }
        >
          <option value={0}>{t("rotateNone")}</option>
          {[90, 180, 270].map((degrees) => (
            <option key={degrees} value={degrees}>
              {t("rotateDegrees", { degrees })}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3 hover:bg-surface-muted">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 accent-(--primary)"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label
        htmlFor={id}
        className="flex flex-1 cursor-pointer items-center gap-1.5 text-sm font-medium"
      >
        {label}
      </label>
      <Tooltip content={description}>
        <button
          type="button"
          className="rounded-md p-0.5 text-muted hover:text-foreground"
          aria-label={typeof description === "string" ? description : label}
        >
          <Info className="size-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}

export function MergeOptionsPanel({
  state,
  files,
  onChange,
}: {
  state: MergeState;
  files: LocalFile[];
  onChange: (next: MergeState) => void;
}) {
  const t = useTranslations("toolPage");
  const presets: { id: MergePresetId; label: string }[] = [
    { id: "all", label: t("presetAll") },
    { id: "firstPages", label: t("presetFirstPages") },
    { id: "noBookmarks", label: t("presetNoBookmarks") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {t("presets")}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(applyMergePreset(preset.id, state, files))}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1 border-t border-border pt-3">
        <legend className="sr-only">{t("options")}</legend>
        <ToggleRow
          id="add-bookmarks"
          label={t("mergeBookmarks")}
          description={t("mergeBookmarksHint")}
          checked={state.addBookmarks}
          onChange={(value) => onChange({ ...state, addBookmarks: value })}
        />
        <ToggleRow
          id="keep-outline"
          label={t("mergeKeepOutline")}
          description={t("mergeKeepOutlineHint")}
          checked={state.keepOutline}
          onChange={(value) => onChange({ ...state, keepOutline: value })}
        />
      </fieldset>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <label htmlFor="output-name" className="text-sm font-medium">
          {t("outputName")}
        </label>
        <Input
          id="output-name"
          value={state.outputName}
          maxLength={180}
          onChange={(event) => onChange({ ...state, outputName: event.target.value })}
        />
      </div>
    </div>
  );
}
