"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { PageGrid } from "@/components/pages/page-grid";
import { PageRangeInput } from "@/components/pages/page-range-input";
import {
  OrganizeEditor,
  organizePayload,
  useOrganizeState,
} from "@/components/tools/organize-editor";
import { ToggleRow } from "@/components/tools/option-panels";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { formatPageSet } from "@/lib/page-expression";
import { cn } from "@/lib/utils";

export type PageToolView = {
  main: ReactNode;
  options: ReactNode;
  payload: Record<string, unknown>;
  problem: string | null;
  summary: string | null;
};

type SplitMode = "ranges" | "every" | "size" | "bookmarks" | "blank" | "each";
const SPLIT_MODES: SplitMode[] = ["ranges", "every", "size", "bookmarks", "blank", "each"];
const DEFAULT_TEMPLATE = "{name}_part-{part}_pages-{start}-{end}";

function Segmented<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  name,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {options.map((option) => (
          <label
            key={String(option.value)}
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
    </fieldset>
  );
}

function rangesFromMarkers(markers: Set<number>, count: number): string[] {
  const cuts = [...markers].filter((page) => page < count - 1).sort((a, b) => a - b);
  const bounds = [-1, ...cuts, count - 1];
  return bounds.slice(1).map((end, index) => {
    const start = bounds[index] + 2;
    return start === end + 1 ? `${start}` : `${start}-${end + 1}`;
  });
}

export function usePageTool(slug: string, files: LocalFile[]): PageToolView {
  const t = useTranslations("pageTools");
  const first = files[0];
  const pageCount = first?.pageCount ?? 0;
  const fileId = first?.uploadId ?? null;
  const single = files.length === 1;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [perPage, setPerPage] = useState<Record<number, number>>({});
  const [extractMode, setExtractMode] = useState<"single" | "separate">("single");
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [markers, setMarkers] = useState<Set<number>>(new Set());
  const [rangesText, setRangesText] = useState("");
  const [mergeRanges, setMergeRanges] = useState(false);
  const [every, setEvery] = useState(1);
  const [maxSize, setMaxSize] = useState(10);
  const [threshold, setThreshold] = useState(0.995);
  const [removeBlank, setRemoveBlank] = useState(true);
  const [keepBookmarks, setKeepBookmarks] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const organize = useOrganizeState(files);

  const grid = (props: Partial<Parameters<typeof PageGrid>[0]> = {}) =>
    pageCount > 0 ? (
      <PageGrid
        fileId={fileId}
        pageCount={pageCount}
        selected={selected}
        onSelectedChange={setSelected}
        label={t("gridLabel", { name: first?.name ?? "" })}
        {...props}
      />
    ) : (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {first?.status === "ready" ? t("unlockForPreview") : t("waitingForUpload")}
      </p>
    );

  const rangeInput =
    pageCount > 0 ? (
      <PageRangeInput pageCount={pageCount} selected={selected} onSelectedChange={setSelected} />
    ) : null;

  const splitRanges = useMemo(() => {
    if (markers.size) return rangesFromMarkers(markers, pageCount);
    return rangesText
      .split(/[\n;]/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [markers, pageCount, rangesText]);

  if (slug === "rotate") {
    const rotatePage = (page: number) =>
      setPerPage((current) => ({ ...current, [page]: ((current[page] ?? 0) + 90) % 360 }));
    const perPageEntries = Object.entries(perPage).filter(([, value]) => value);
    const payload: Record<string, unknown> = perPageEntries.length
      ? {
          per_page: Object.fromEntries(
            perPageEntries.map(([page, value]) => [Number(page) + 1, value]),
          ),
        }
      : { angle, pages: selected.size ? formatPageSet(selected) : null };
    const previewRotations = perPageEntries.length
      ? perPage
      : Object.fromEntries(
          Array.from({ length: pageCount }, (_, page) => [
            page,
            selected.size === 0 || selected.has(page) ? angle : 0,
          ]),
        );
    return {
      main: single ? grid({ rotations: previewRotations, onRotatePage: rotatePage }) : null,
      options: (
        <div className="flex flex-col gap-4">
          <Segmented
            legend={t("rotate.angle")}
            name="rotate-angle"
            value={angle}
            onChange={setAngle}
            options={[
              { value: 90, label: t("rotate.right") },
              { value: 180, label: t("rotate.half") },
              { value: 270, label: t("rotate.left") },
            ]}
          />
          {single ? (
            rangeInput
          ) : (
            <p className="text-sm text-muted">{t("rotate.batch", { count: files.length })}</p>
          )}
          {perPageEntries.length ? (
            <div className="flex items-center justify-between rounded-xl bg-surface-muted p-3 text-xs">
              <span>{t("rotate.perPage", { count: perPageEntries.length })}</span>
              <button
                type="button"
                className="font-medium text-primary"
                onClick={() => setPerPage({})}
              >
                {t("reset")}
              </button>
            </div>
          ) : null}
        </div>
      ),
      payload,
      problem: null,
      summary: single
        ? t("rotate.summary", { count: perPageEntries.length || selected.size || pageCount })
        : t("rotate.batch", { count: files.length }),
    };
  }

  if (slug === "remove-pages") {
    const remaining = pageCount - selected.size;
    return {
      main: grid({ mode: "delete" }),
      options: (
        <div className="flex flex-col gap-4">
          {rangeInput}
          <p className="text-xs text-muted">{t("remove.hint")}</p>
        </div>
      ),
      payload: { pages: formatPageSet(selected) },
      problem: selected.size === 0 ? t("remove.none") : remaining < 1 ? t("remove.all") : null,
      summary: selected.size ? t("remove.summary", { removed: selected.size, remaining }) : null,
    };
  }

  if (slug === "extract-pages") {
    return {
      main: grid(),
      options: (
        <div className="flex flex-col gap-4">
          {rangeInput}
          <Segmented
            legend={t("extract.mode")}
            name="extract-mode"
            value={extractMode}
            onChange={setExtractMode}
            options={[
              { value: "single", label: t("extract.single") },
              { value: "separate", label: t("extract.separate") },
            ]}
          />
        </div>
      ),
      payload: { pages: formatPageSet(selected), mode: extractMode },
      problem: selected.size === 0 ? t("extract.none") : null,
      summary: selected.size
        ? extractMode === "single"
          ? t("extract.summarySingle", { count: selected.size })
          : t("filesCount", { count: selected.size })
        : null,
    };
  }

  if (slug === "split") {
    const toggleMarker = (page: number) =>
      setMarkers((current) => {
        const next = new Set(current);
        if (next.has(page)) next.delete(page);
        else next.add(page);
        return next;
      });
    const predicted =
      splitMode === "ranges"
        ? mergeRanges
          ? 1
          : splitRanges.length
        : splitMode === "every"
          ? Math.ceil(pageCount / Math.max(every, 1))
          : splitMode === "each"
            ? pageCount
            : null;
    return {
      main:
        splitMode === "ranges"
          ? grid({ splitMarkers: markers, onToggleSplitMarker: toggleMarker })
          : grid(),
      options: (
        <div className="flex flex-col gap-4">
          <Segmented
            legend={t("split.mode")}
            name="split-mode"
            value={splitMode}
            onChange={setSplitMode}
            options={SPLIT_MODES.map((mode) => ({ value: mode, label: t(`split.modes.${mode}`) }))}
          />
          {splitMode === "ranges" ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="split-ranges" className="text-sm font-medium">
                {t("split.ranges")}
              </label>
              <textarea
                id="split-ranges"
                dir="ltr"
                rows={3}
                value={markers.size ? splitRanges.join("\n") : rangesText}
                readOnly={markers.size > 0}
                onChange={(event) => setRangesText(event.target.value)}
                placeholder={"1-3\n4-end"}
                className="rounded-(--radius-control) border border-border-strong bg-surface p-2 font-mono text-sm"
              />
              <p className="text-xs text-muted">
                {markers.size ? t("split.markersActive") : t("split.rangesHint")}
              </p>
              {markers.size ? (
                <button
                  type="button"
                  className="self-start text-xs font-medium text-primary"
                  onClick={() => setMarkers(new Set())}
                >
                  {t("split.clearMarkers")}
                </button>
              ) : null}
              <ToggleRow
                id="split-merge"
                label={t("split.merge")}
                description={t("split.mergeHint")}
                checked={mergeRanges}
                onChange={setMergeRanges}
              />
            </div>
          ) : null}
          {splitMode === "every" ? (
            <NumberField
              id="split-every"
              label={t("split.every")}
              value={every}
              min={1}
              max={10000}
              step={1}
              onChange={setEvery}
            />
          ) : null}
          {splitMode === "size" ? (
            <NumberField
              id="split-size"
              label={t("split.size")}
              value={maxSize}
              min={0.1}
              max={2048}
              step={0.5}
              onChange={setMaxSize}
            />
          ) : null}
          {splitMode === "blank" ? (
            <>
              <NumberField
                id="split-threshold"
                label={t("split.threshold")}
                value={threshold}
                min={0.9}
                max={1}
                step={0.001}
                onChange={setThreshold}
              />
              <ToggleRow
                id="split-remove-blank"
                label={t("split.removeBlank")}
                description={t("split.removeBlankHint")}
                checked={removeBlank}
                onChange={setRemoveBlank}
              />
            </>
          ) : null}
          <ToggleRow
            id="split-bookmarks"
            label={t("split.keepBookmarks")}
            description={t("split.keepBookmarksHint")}
            checked={keepBookmarks}
            onChange={setKeepBookmarks}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="split-template" className="text-sm font-medium">
              {t("split.template")}
            </label>
            <Input
              id="split-template"
              dir="ltr"
              value={template}
              maxLength={120}
              onChange={(event) => setTemplate(event.target.value)}
            />
            <p className="text-xs text-muted">{t("split.templateHint")}</p>
          </div>
        </div>
      ),
      payload: {
        mode: splitMode,
        ranges: splitRanges,
        merge_ranges: mergeRanges,
        every,
        max_size_mb: maxSize,
        blank_threshold: threshold,
        remove_blank_pages: removeBlank,
        keep_bookmarks: keepBookmarks,
        filename_template: template.trim() || DEFAULT_TEMPLATE,
      },
      problem: splitMode === "ranges" && splitRanges.length === 0 ? t("split.noRanges") : null,
      summary: predicted !== null ? t("filesCount", { count: predicted }) : null,
    };
  }

  return {
    main: <OrganizeEditor state={organize} files={files} />,
    options: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t("organize.hint")}</p>
        <ToggleRow
          id="organize-bookmarks"
          label={t("split.keepBookmarks")}
          description={t("split.keepBookmarksHint")}
          checked={keepBookmarks}
          onChange={setKeepBookmarks}
        />
      </div>
    ),
    payload: {
      ...organizePayload(organize.pages, organize.fileKeys),
      keep_bookmarks: keepBookmarks,
    },
    problem: organize.pages.length === 0 ? t("organize.empty") : null,
    summary: t("organize.summary", { count: organize.pages.length }),
  };
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        dir="ltr"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(Math.min(Math.max(parsed, min), max));
        }}
      />
    </div>
  );
}
