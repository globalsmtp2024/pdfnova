import {
  detectFileKind,
  findTool,
  suggestTools,
  type FileKind,
  type ToolDefinition,
} from "@/config/tools";

export type SuggestionFile = {
  name: string;
  type: string;
  size: number;
  pageCount: number | null;
  encrypted: boolean;
};

export type Suggestion = { tool: ToolDefinition; reason: string };

const MB = 1024 * 1024;
const LARGE_PDF_BYTES = 5 * MB;
const LONG_DOCUMENT_PAGES = 12;
const SCAN_NAME = /(scan|scanned|img[_-]?\d|dsc[_-]?\d|camscanner|photo|whatsapp)/i;
const FORM_NAME = /(form|application|agreement|contract|nda|consent|declaration|invoice|receipt)/i;
const CV_NAME = /(resume|curriculum|cv\b)/i;
const SLIDES_NAME = /(slides|deck|presentation)/i;

export function ruleBasedSuggestions(files: SuggestionFile[]): Suggestion[] {
  const kinds = files.map((file) => detectFileKind(file));
  const known = kinds.filter((kind): kind is FileKind => kind !== null);
  const result: Suggestion[] = [];
  const add = (slug: string, reason: string) => {
    const tool = findTool(slug);
    if (tool && !result.some((entry) => entry.tool.slug === slug)) result.push({ tool, reason });
  };
  if (!files.length) return result;

  const pdfs = files.filter((_, index) => kinds[index] === "pdf");
  const images = files.filter((_, index) => kinds[index] === "image");
  const allPdf = pdfs.length === files.length;
  const allImages = images.length === files.length;

  if (files.some((file) => file.encrypted)) add("unlock", "encrypted");
  if (allPdf && pdfs.length >= 2) {
    add("merge", "several");
    add("interleave-pages", "scanSides");
  }
  if (allImages) {
    add("image-to-pdf", "images");
    add("scan-to-pdf", "photos");
    if (images.some((file) => file.size > 2 * MB)) add("image-compress", "largeImage");
  }
  for (const file of pdfs) {
    if (file.size > LARGE_PDF_BYTES) add("compress", "large");
    if ((file.pageCount ?? 0) > LONG_DOCUMENT_PAGES) {
      add("split", "long");
      add("extract-pages", "long");
    }
    if (SCAN_NAME.test(file.name)) {
      add("ocr", "scan");
      add("remove-blank-pages", "scan");
    }
    if (FORM_NAME.test(file.name)) {
      add("sign", "form");
      add("fill-forms", "form");
    }
    if (CV_NAME.test(file.name)) {
      add("compress", "cv");
      add("protect", "cv");
    }
    if (SLIDES_NAME.test(file.name)) add("pdf-to-powerpoint", "slides");
  }
  if (allPdf) {
    add("remove-hidden-data", "privacy");
    for (const tool of suggestTools(known, files.length)) add(tool.slug, "popular");
  } else {
    for (const tool of suggestTools(known, files.length)) add(tool.slug, "popular");
  }
  return result;
}
