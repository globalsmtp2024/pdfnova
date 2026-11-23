"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { OrganizeEditor, useOrganizeState } from "@/components/tools/organize-editor";
import {
  applyMergePreset,
  BOOKMARK_MODES,
  DEFAULT_MERGE_STATE,
  DEFAULT_PER_FILE,
  estimateOutput,
  mergeOptionsPayload,
  type BookmarkMode,
  type FormFieldMode,
  type MergeMode,
  type MergePresetId,
  type MergeState,
  type PerFileOptions,
  type Rotation,
} from "@/components/tools/panels/merge-state";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { cn, formatBytes } from "@/lib/utils";

function Choice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <label
            key={option.value}
            data-merge-choice={`${name}-${option.value}`}
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
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}

function MergePerFileControls({
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
          dir="ltr"
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

const BOOKMARK_LABELS: Record<BookmarkMode, string> = {
  both: "bookmarksBoth",
  perFile: "bookmarksPerFile",
  existing: "bookmarksExisting",
  none: "bookmarksNone",
};

export function useMergePanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_merge");
  const page = useTranslations("toolPage");
  const [state, setState] = useState<MergeState>(DEFAULT_MERGE_STATE);
  const organize = useOrganizeState(files);
  const pageMode = state.mode === "pages";
  const estimate = estimateOutput(state, files, organize.pages);
  const update = (patch: Partial<MergeState>) => setState((current) => ({ ...current, ...patch }));
  const presets: { id: MergePresetId; label: string }[] = [
    { id: "all", label: page("presetAll") },
    { id: "firstPages", label: page("presetFirstPages") },
    { id: "noBookmarks", label: page("presetNoBookmarks") },
  ];

  return {
    main: pageMode ? <OrganizeEditor state={organize} files={files} /> : null,
    options: (
      <div className="flex flex-col gap-4">
        <Choice<MergeMode>
          legend={t("modeLegend")}
          name="merge-mode"
          value={state.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: "files", label: t("modeFiles") },
            { value: "pages", label: t("modePages") },
          ]}
          hint={pageMode ? t("pagesHint") : t("filesHint")}
        />
        <fieldset className="flex flex-col gap-2 border-t border-border pt-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {page("presets")}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setState((current) => applyMergePreset(preset.id, current, files))}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="border-t border-border pt-3">
          <Choice<BookmarkMode>
            legend={t("bookmarksLegend")}
            name="merge-bookmarks"
            value={state.bookmarks}
            onChange={(bookmarks) => update({ bookmarks })}
            options={BOOKMARK_MODES.map((mode) => ({
              value: mode,
              label: t(BOOKMARK_LABELS[mode]),
            }))}
            hint={t("bookmarksHint")}
          />
        </div>
        <div className="border-t border-border pt-3">
          <Choice<FormFieldMode>
            legend={t("formsLegend")}
            name="merge-forms"
            value={state.formFields}
            onChange={(formFields) => update({ formFields })}
            options={[
              { value: "preserve", label: t("formsPreserve") },
              { value: "discard", label: t("formsDiscard") },
            ]}
            hint={state.formFields === "preserve" ? t("formsHint") : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <label htmlFor="output-name" className="text-sm font-medium">
            {page("outputName")}
          </label>
          <Input
            id="output-name"
            value={state.outputName}
            maxLength={180}
            onChange={(event) => update({ outputName: event.target.value })}
          />
        </div>
      </div>
    ),
    payload: mergeOptionsPayload(state, files, organize.pages),
    problem: pageMode && organize.pages.length === 0 ? t("empty") : null,
    summary: t("estimate", { pages: estimate.pages, size: formatBytes(estimate.bytes) }),
    renderFileExtras: pageMode
      ? undefined
      : (file) => (
          <MergePerFileControls
            file={file}
            value={state.perFile[file.key] ?? DEFAULT_PER_FILE}
            onChange={(next) =>
              setState((current) => ({
                ...current,
                perFile: { ...current.perFile, [file.key]: next },
              }))
            }
          />
        ),
  };
}
