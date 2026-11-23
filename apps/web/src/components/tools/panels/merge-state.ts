import { organizePayload, type OrganizePage } from "@/components/tools/organize-state";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { parsePageExpression } from "@/lib/page-expression";

export type Rotation = 0 | 90 | 180 | 270;
export type PerFileOptions = { pages: string; rotate: Rotation };
export type MergeMode = "files" | "pages";
export type BookmarkMode = "both" | "perFile" | "existing" | "none";
export type FormFieldMode = "preserve" | "discard";

export type MergeState = {
  mode: MergeMode;
  bookmarks: BookmarkMode;
  formFields: FormFieldMode;
  outputName: string;
  perFile: Record<string, PerFileOptions>;
};

export const DEFAULT_PER_FILE: PerFileOptions = { pages: "", rotate: 0 };

export const DEFAULT_MERGE_STATE: MergeState = {
  mode: "files",
  bookmarks: "both",
  formFields: "preserve",
  outputName: "merged.pdf",
  perFile: {},
};

export const BOOKMARK_MODES: BookmarkMode[] = ["both", "perFile", "existing", "none"];

export type MergePresetId = "all" | "firstPages" | "noBookmarks";

export function applyMergePreset(
  preset: MergePresetId,
  state: MergeState,
  files: LocalFile[],
): MergeState {
  if (preset === "all") return { ...state, bookmarks: "both", perFile: {} };
  if (preset === "firstPages") {
    return {
      ...state,
      mode: "files",
      perFile: Object.fromEntries(
        files.map((entry) => [
          entry.key,
          { ...(state.perFile[entry.key] ?? DEFAULT_PER_FILE), pages: "1" },
        ]),
      ),
    };
  }
  return { ...state, bookmarks: "none" };
}

function bookmarkFlags(mode: BookmarkMode) {
  return {
    add_bookmarks: mode === "both" || mode === "perFile",
    keep_existing_bookmarks: mode === "both" || mode === "existing",
  };
}

export function mergeOptionsPayload(
  state: MergeState,
  files: LocalFile[],
  pages: OrganizePage[],
): Record<string, unknown> {
  const pageMode = state.mode === "pages";
  return {
    ...bookmarkFlags(state.bookmarks),
    form_fields: state.formFields,
    output_name: state.outputName.trim() || "merged.pdf",
    files: files.map((entry) => {
      const options = pageMode ? DEFAULT_PER_FILE : (state.perFile[entry.key] ?? DEFAULT_PER_FILE);
      return {
        pages: options.pages.trim() || null,
        rotate: options.rotate,
        bookmark_title: entry.name.replace(/\.pdf$/i, ""),
      };
    }),
    ...(pageMode
      ? organizePayload(
          pages,
          files.map((entry) => entry.key),
        )
      : {}),
  };
}

function selectedCount(entry: LocalFile, options: PerFileOptions): number | null {
  if (!entry.pageCount) return null;
  if (!options.pages.trim()) return entry.pageCount;
  const parsed = parsePageExpression(options.pages, entry.pageCount);
  return parsed.ok ? parsed.pages.length : entry.pageCount;
}

export function estimateOutput(
  state: MergeState,
  files: LocalFile[],
  pages: OrganizePage[],
): { pages: number; bytes: number } {
  let pageTotal = 0;
  let bytes = 0;
  if (state.mode === "pages") {
    const counts = new Map<string, number>();
    for (const page of pages) {
      pageTotal += 1;
      if (page.source === "file") counts.set(page.fileKey, (counts.get(page.fileKey) ?? 0) + 1);
    }
    for (const entry of files) {
      const used = counts.get(entry.key) ?? 0;
      if (entry.pageCount) bytes += (entry.size * used) / entry.pageCount;
    }
    return { pages: pageTotal, bytes: Math.round(bytes) };
  }
  for (const entry of files) {
    const count = selectedCount(entry, state.perFile[entry.key] ?? DEFAULT_PER_FILE);
    if (count === null) {
      bytes += entry.size;
      continue;
    }
    pageTotal += count;
    bytes += (entry.size * count) / (entry.pageCount ?? count);
  }
  return { pages: pageTotal, bytes: Math.round(bytes) };
}
