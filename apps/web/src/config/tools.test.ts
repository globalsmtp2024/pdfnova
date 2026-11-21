import { describe, expect, it } from "vitest";

import {
  detectFileKind,
  findTool,
  searchTools,
  suggestTools,
  TOOL_CATEGORIES,
  TOOLS,
} from "@/config/tools";

describe("tool catalog", () => {
  it("has unique slugs and valid categories", () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const categories = new Set(TOOL_CATEGORIES.map((category) => category.id));
    expect(TOOLS.every((tool) => categories.has(tool.category))).toBe(true);
    expect(TOOLS.length).toBeGreaterThanOrEqual(70);
  });

  it("searches by name, keyword and category", () => {
    expect(searchTools(TOOLS, "combine", "all").map((tool) => tool.slug)).toContain("merge");
    expect(searchTools(TOOLS, "JPG", "convert_to_pdf").map((tool) => tool.slug)).toEqual([
      "image-to-pdf",
    ]);
    expect(searchTools(TOOLS, "", "security").every((tool) => tool.category === "security")).toBe(
      true,
    );
    expect(searchTools(TOOLS, "no such thing", "all")).toEqual([]);
  });
});

describe("file detection and suggestions", () => {
  it("detects kinds by MIME and extension", () => {
    expect(detectFileKind({ name: "a.bin", type: "application/pdf" })).toBe("pdf");
    expect(detectFileKind({ name: "photo.HEIC", type: "" })).toBe("image");
    expect(detectFileKind({ name: "report.docx", type: "" })).toBe("word");
    expect(detectFileKind({ name: "notes.md", type: "" })).toBe("text");
    expect(detectFileKind({ name: "archive.zip", type: "application/zip" })).toBeNull();
  });

  it("suggests merge only for two or more PDFs", () => {
    expect(suggestTools(["pdf"], 1).map((tool) => tool.slug)).not.toContain("merge");
    expect(suggestTools(["pdf", "pdf"], 2)[0]?.slug).toBe("merge");
    expect(suggestTools(["word"], 1).map((tool) => tool.slug)).toEqual(["word-to-pdf"]);
    expect(suggestTools([], 0)).toEqual([]);
  });

  it("finds tools by slug", () => {
    expect(findTool("merge")?.minFiles).toBe(2);
    expect(findTool("missing")).toBeUndefined();
  });
});
