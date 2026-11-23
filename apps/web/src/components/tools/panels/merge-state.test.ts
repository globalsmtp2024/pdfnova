import { describe, expect, it } from "vitest";

import { pagesForFile } from "@/components/tools/organize-state";
import {
  applyMergePreset,
  DEFAULT_MERGE_STATE,
  estimateOutput,
  mergeOptionsPayload,
} from "@/components/tools/panels/merge-state";
import type { LocalFile } from "@/components/tools/use-tool-session";

function file(key: string, name: string, pageCount: number | null, size: number): LocalFile {
  return {
    key,
    file: null,
    name,
    size,
    status: "ready",
    uploaded: size,
    uploadId: `upload-${key}`,
    pageCount,
    encrypted: false,
    password: "",
    unlocked: false,
    error: null,
  };
}

const files = [file("a", "alpha.pdf", 4, 4000), file("b", "beta.pdf", 2, 1000)];

describe("merge payload", () => {
  it("sends per-file ranges in file mode", () => {
    const state = { ...DEFAULT_MERGE_STATE, perFile: { b: { pages: "2", rotate: 90 as const } } };
    const payload = mergeOptionsPayload(state, files, []);
    expect(payload).toMatchObject({
      add_bookmarks: true,
      keep_existing_bookmarks: true,
      form_fields: "preserve",
      files: [
        { pages: null, rotate: 0, bookmark_title: "alpha" },
        { pages: "2", rotate: 90, bookmark_title: "beta" },
      ],
    });
    expect(payload).not.toHaveProperty("pages");
  });

  it("sends ordered pages with file positions in page mode", () => {
    const pages = [...pagesForFile("b", 1, 2), ...pagesForFile("a", 0, 1)];
    pages[0] = { ...pages[0], rotate: 270 };
    const state = {
      ...DEFAULT_MERGE_STATE,
      mode: "pages" as const,
      bookmarks: "existing" as const,
      formFields: "discard" as const,
      perFile: { a: { pages: "1", rotate: 90 as const } },
    };
    const payload = mergeOptionsPayload(state, files, pages);
    expect(payload).toMatchObject({
      add_bookmarks: false,
      keep_existing_bookmarks: true,
      form_fields: "discard",
      pages: [
        { source: "file", file: 1, page: 1, rotate: 270 },
        { source: "file", file: 1, page: 2, rotate: 0 },
        { source: "file", file: 0, page: 1, rotate: 0 },
      ],
    });
    expect((payload.files as { pages: string | null }[])[0].pages).toBeNull();
  });

  it("maps presets onto bookmark modes", () => {
    expect(applyMergePreset("noBookmarks", DEFAULT_MERGE_STATE, files).bookmarks).toBe("none");
    expect(applyMergePreset("firstPages", DEFAULT_MERGE_STATE, files).perFile.b.pages).toBe("1");
  });
});

describe("merge size estimate", () => {
  it("scales file size by selected pages in file mode", () => {
    const state = { ...DEFAULT_MERGE_STATE, perFile: { a: { pages: "1-2", rotate: 0 as const } } };
    expect(estimateOutput(state, files, [])).toEqual({ pages: 4, bytes: 3000 });
  });

  it("counts pages actually placed in page mode", () => {
    const pages = [...pagesForFile("a", 0, 4).slice(0, 1), ...pagesForFile("b", 1, 2)];
    const state = { ...DEFAULT_MERGE_STATE, mode: "pages" as const };
    expect(estimateOutput(state, files, pages)).toEqual({ pages: 3, bytes: 2000 });
  });

  it("counts files with unknown page count at full size", () => {
    const locked = [file("c", "locked.pdf", null, 500), ...files];
    expect(estimateOutput(DEFAULT_MERGE_STATE, locked, [])).toEqual({ pages: 6, bytes: 5500 });
  });
});
