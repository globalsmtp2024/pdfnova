export type ToolCategoryId =
  | "organize"
  | "optimize"
  | "convert_to_pdf"
  | "convert_from_pdf"
  | "edit"
  | "security"
  | "ai"
  | "image";

export type FileKind = "pdf" | "image" | "word" | "excel" | "powerpoint" | "html" | "text" | "epub";

export const FILE_KINDS: FileKind[] = [
  "pdf",
  "image",
  "word",
  "excel",
  "powerpoint",
  "html",
  "text",
  "epub",
];

export type ToolDefinition = {
  slug: string;
  name: string;
  category: ToolCategoryId;
  description: string;
  accepts: FileKind[];
  minFiles: number;
  keywords: string[];
};

export type ToolCategory = {
  id: ToolCategoryId;
  path: string;
  label: string;
  color: string;
  tint: string;
  softBackground: string;
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "organize",
    path: "organize",
    label: "Organize",
    color: "#5B4BFF",
    tint: "text-cat-organize",
    softBackground: "bg-cat-organize/10",
  },
  {
    id: "optimize",
    path: "optimize",
    label: "Optimize",
    color: "#12B5A6",
    tint: "text-cat-optimize",
    softBackground: "bg-cat-optimize/10",
  },
  {
    id: "convert_to_pdf",
    path: "convert-to-pdf",
    label: "Convert to PDF",
    color: "#F97316",
    tint: "text-cat-convert",
    softBackground: "bg-cat-convert/10",
  },
  {
    id: "convert_from_pdf",
    path: "convert-from-pdf",
    label: "Convert from PDF",
    color: "#F59E0B",
    tint: "text-cat-convert",
    softBackground: "bg-cat-convert/10",
  },
  {
    id: "edit",
    path: "edit",
    label: "Edit",
    color: "#EC4899",
    tint: "text-cat-edit",
    softBackground: "bg-cat-edit/10",
  },
  {
    id: "security",
    path: "security",
    label: "Security",
    color: "#10B981",
    tint: "text-cat-security",
    softBackground: "bg-cat-security/10",
  },
  {
    id: "ai",
    path: "ai",
    label: "AI",
    color: "#8B5CF6",
    tint: "text-cat-ai",
    softBackground: "bg-cat-ai/10",
  },
  {
    id: "image",
    path: "image",
    label: "Image",
    color: "#2F80ED",
    tint: "text-cat-image",
    softBackground: "bg-cat-image/10",
  },
];

export const CATEGORY_IDS: string[] = TOOL_CATEGORIES.map((category) => category.path);

export function categoryByPath(path: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((category) => category.path === path);
}

export const POPULAR_TOOL_SLUGS = [
  "merge",
  "compress",
  "split",
  "pdf-to-word",
  "image-to-pdf",
  "edit-pdf",
  "sign",
  "protect",
] as const;

export function isPopular(slug: string): boolean {
  return (POPULAR_TOOL_SLUGS as readonly string[]).includes(slug);
}
const tool = (
  slug: string,
  name: string,
  category: ToolCategoryId,
  description: string,
  accepts: FileKind[] = ["pdf"],
  keywords: string[] = [],
  minFiles = 1,
): ToolDefinition => ({ slug, name, category, description, accepts, keywords, minFiles });

export const TOOLS: ToolDefinition[] = [
  tool(
    "merge",
    "Merge PDF",
    "organize",
    "Combine PDFs in any order with page ranges and bookmarks.",
    ["pdf"],
    ["combine", "join"],
    2,
  ),
  tool(
    "split",
    "Split PDF",
    "organize",
    "Split by ranges, every N pages, size, bookmarks or blank pages.",
    ["pdf"],
    ["separate", "divide"],
  ),
  tool(
    "remove-pages",
    "Remove pages",
    "organize",
    "Pick the pages you don't need and drop them.",
    ["pdf"],
    ["delete"],
  ),
  tool(
    "extract-pages",
    "Extract pages",
    "organize",
    "Pull selected pages into a new PDF.",
    ["pdf"],
    ["select"],
  ),
  tool(
    "organize",
    "Organize PDF",
    "organize",
    "Reorder, rotate, duplicate and insert pages visually.",
    ["pdf"],
    ["reorder", "sort"],
  ),
  tool(
    "scan-to-pdf",
    "Scan to PDF",
    "organize",
    "Use your camera to scan pages into a clean PDF.",
    ["image"],
    ["camera", "scanner"],
  ),
  tool(
    "compress",
    "Compress PDF",
    "optimize",
    "Shrink file size while keeping documents sharp.",
    ["pdf"],
    ["reduce", "smaller", "optimize"],
  ),
  tool(
    "repair",
    "Repair PDF",
    "optimize",
    "Recover damaged or corrupted PDF files.",
    ["pdf"],
    ["fix", "corrupt"],
  ),
  tool(
    "ocr",
    "OCR PDF",
    "optimize",
    "Make scanned PDFs searchable in 50+ languages.",
    ["pdf", "image"],
    ["text recognition", "searchable"],
  ),
  tool(
    "flatten",
    "Flatten PDF",
    "optimize",
    "Merge form fields and annotations into the page.",
    ["pdf"],
    ["forms"],
  ),
  tool(
    "linearize",
    "Web optimize",
    "optimize",
    "Linearize PDFs for fast web viewing.",
    ["pdf"],
    ["linearize", "fast web view"],
  ),
  tool(
    "remove-annotations",
    "Remove annotations",
    "optimize",
    "Strip comments, highlights and stamps.",
    ["pdf"],
    ["comments", "highlights", "markup"],
  ),
  tool(
    "remove-blank-pages",
    "Remove blank pages",
    "optimize",
    "Detect and delete empty pages automatically.",
    ["pdf"],
    ["blank", "empty", "scanner"],
  ),
  tool(
    "workflow",
    "Workflow runner",
    "organize",
    "Chain several PDF tools into one run.",
    ["pdf"],
    ["automation", "pipeline", "batch", "chain"],
  ),
  tool(
    "reverse-pages",
    "Reverse pages",
    "organize",
    "Flip the page order of a PDF.",
    ["pdf"],
    ["reverse", "flip", "backwards"],
  ),
  tool(
    "remove-metadata",
    "Remove metadata",
    "optimize",
    "Strip hidden author, software and history data.",
    ["pdf"],
    ["privacy"],
  ),
  tool(
    "grayscale",
    "Grayscale PDF",
    "optimize",
    "Convert to grayscale or pure black and white.",
    ["pdf"],
    ["black and white"],
  ),
  tool(
    "image-to-pdf",
    "Image to PDF",
    "convert_to_pdf",
    "JPG, PNG, WebP, TIFF, BMP and HEIC into PDF.",
    ["image"],
    ["jpg", "png", "photo"],
  ),
  tool(
    "word-to-pdf",
    "Word to PDF",
    "convert_to_pdf",
    "Convert DOC and DOCX with layout intact.",
    ["word"],
    ["docx", "doc"],
  ),
  tool(
    "powerpoint-to-pdf",
    "PowerPoint to PDF",
    "convert_to_pdf",
    "Turn slides into a shareable PDF.",
    ["powerpoint"],
    ["pptx", "slides"],
  ),
  tool(
    "excel-to-pdf",
    "Excel to PDF",
    "convert_to_pdf",
    "Spreadsheets to print-ready PDF.",
    ["excel"],
    ["xlsx", "sheet"],
  ),
  tool(
    "html-to-pdf",
    "HTML to PDF",
    "convert_to_pdf",
    "Render HTML files into PDF.",
    ["html"],
    ["web"],
  ),
  tool(
    "url-to-pdf",
    "URL to PDF",
    "convert_to_pdf",
    "Capture any public web page as a PDF.",
    [],
    ["website", "link"],
  ),
  tool(
    "markdown-to-pdf",
    "Markdown to PDF",
    "convert_to_pdf",
    "Beautifully typeset Markdown documents.",
    ["text"],
    ["md"],
  ),
  tool(
    "text-to-pdf",
    "Text to PDF",
    "convert_to_pdf",
    "Plain text into a clean PDF.",
    ["text"],
    ["txt"],
  ),
  tool(
    "epub-to-pdf",
    "EPUB to PDF",
    "convert_to_pdf",
    "E-books into printable PDF.",
    ["epub"],
    ["ebook"],
  ),
  tool(
    "pdf-to-image",
    "PDF to image",
    "convert_from_pdf",
    "Export pages as JPG, PNG, WebP or TIFF.",
    ["pdf"],
    ["jpg", "png"],
  ),
  tool(
    "pdf-to-word",
    "PDF to Word",
    "convert_from_pdf",
    "Editable DOCX with real paragraphs and tables.",
    ["pdf"],
    ["docx"],
  ),
  tool(
    "pdf-to-powerpoint",
    "PDF to PowerPoint",
    "convert_from_pdf",
    "Turn PDF pages into editable slides.",
    ["pdf"],
    ["pptx"],
  ),
  tool(
    "pdf-to-excel",
    "PDF to Excel",
    "convert_from_pdf",
    "Detect tables and export them to XLSX.",
    ["pdf"],
    ["xlsx", "tables"],
  ),
  tool(
    "pdf-to-pdfa",
    "PDF to PDF/A",
    "convert_from_pdf",
    "Archive-ready PDF/A-1b, 2b and 3b.",
    ["pdf"],
    ["archive"],
  ),
  tool(
    "pdf-to-markdown",
    "PDF to Markdown",
    "convert_from_pdf",
    "Structured Markdown from any PDF.",
    ["pdf"],
    ["md"],
  ),
  tool(
    "pdf-to-html",
    "PDF to HTML",
    "convert_from_pdf",
    "Responsive HTML from PDF pages.",
    ["pdf"],
    ["web"],
  ),
  tool(
    "pdf-to-text",
    "PDF to text",
    "convert_from_pdf",
    "Extract all text as plain text.",
    ["pdf"],
    ["txt"],
  ),
  tool(
    "pdf-to-csv",
    "PDF to CSV",
    "convert_from_pdf",
    "Tables to CSV, ready for analysis.",
    ["pdf"],
    ["tables"],
  ),
  tool(
    "pdf-to-epub",
    "PDF to EPUB",
    "convert_from_pdf",
    "Reflowable e-books from PDF.",
    ["pdf"],
    ["ebook"],
  ),
  tool(
    "rotate",
    "Rotate PDF",
    "edit",
    "Rotate all pages or just the ones you choose.",
    ["pdf"],
    ["turn"],
  ),
  tool(
    "page-numbers",
    "Page numbers",
    "edit",
    "Add numbers with your position, format and font.",
    ["pdf"],
    ["numbering"],
  ),
  tool(
    "watermark",
    "Watermark",
    "edit",
    "Stamp text or images with opacity and tiling.",
    ["pdf"],
    ["stamp"],
  ),
  tool("crop", "Crop PDF", "edit", "Trim margins visually on any page.", ["pdf"], ["trim"]),
  tool(
    "edit-pdf",
    "Edit PDF",
    "edit",
    "Add text, images, shapes, highlights and links.",
    ["pdf"],
    ["editor", "annotate"],
  ),
  tool(
    "fill-forms",
    "Fill PDF forms",
    "edit",
    "Detect fields, fill them and flatten.",
    ["pdf"],
    ["form"],
  ),
  tool(
    "create-forms",
    "Create PDF forms",
    "edit",
    "Add text fields, checkboxes and dropdowns.",
    ["pdf"],
    ["form builder"],
  ),
  tool(
    "header-footer",
    "Header and footer",
    "edit",
    "Add consistent headers and footers.",
    ["pdf"],
    ["header"],
  ),
  tool(
    "bates-numbering",
    "Bates numbering",
    "edit",
    "Legal-grade Bates stamps across documents.",
    ["pdf"],
    ["legal"],
  ),
  tool(
    "background",
    "Page background",
    "edit",
    "Set a background color or image.",
    ["pdf"],
    ["color"],
  ),
  tool(
    "resize-pages",
    "Resize pages",
    "edit",
    "Change page size to A4, Letter or custom.",
    ["pdf"],
    ["a4", "letter"],
  ),
  tool(
    "n-up",
    "N-up and booklet",
    "edit",
    "Print multiple pages per sheet or as a booklet.",
    ["pdf"],
    ["imposition"],
  ),
  tool(
    "bookmarks",
    "Edit bookmarks",
    "edit",
    "Create and edit the document outline.",
    ["pdf"],
    ["outline"],
  ),
  tool(
    "edit-metadata",
    "Edit metadata",
    "edit",
    "Change title, author, subject and keywords.",
    ["pdf"],
    ["properties"],
  ),
  tool(
    "attachments",
    "Attachments",
    "edit",
    "Add, list and remove embedded files.",
    ["pdf"],
    ["embed"],
  ),
  tool(
    "hyperlinks",
    "Add hyperlinks",
    "edit",
    "Link text and areas to pages or websites.",
    ["pdf"],
    ["links"],
  ),
  tool(
    "protect",
    "Protect PDF",
    "security",
    "AES-256 passwords and permission controls.",
    ["pdf"],
    ["password", "encrypt"],
  ),
  tool(
    "unlock",
    "Unlock PDF",
    "security",
    "Remove passwords from PDFs you own.",
    ["pdf"],
    ["decrypt"],
  ),
  tool(
    "sign",
    "Sign PDF",
    "security",
    "Draw, type or upload a signature and place it.",
    ["pdf"],
    ["signature"],
  ),
  tool(
    "redact",
    "Redact PDF",
    "security",
    "Permanently remove sensitive text and areas.",
    ["pdf"],
    ["blackout"],
  ),
  tool(
    "compare",
    "Compare PDF",
    "security",
    "Side-by-side, text and visual differences.",
    ["pdf"],
    ["diff"],
    2,
  ),
  tool(
    "ai-summarize",
    "AI summarizer",
    "ai",
    "Short, detailed, bullet or action-item summaries.",
    ["pdf"],
    ["summary"],
  ),
  tool(
    "ai-translate",
    "Translate PDF",
    "ai",
    "Layout-preserving translation in 40+ languages.",
    ["pdf"],
    ["language"],
  ),
  tool(
    "ai-chat",
    "Chat with PDF",
    "ai",
    "Ask questions and get answers with page citations.",
    ["pdf"],
    ["ask", "question"],
  ),
  tool(
    "ai-smart-split",
    "Smart split",
    "ai",
    "Split by topic, chapter or invoice automatically.",
    ["pdf"],
    ["split"],
  ),
  tool(
    "ai-smart-redact",
    "Smart redact",
    "ai",
    "Describe what to hide in plain language.",
    ["pdf"],
    ["redact"],
  ),
  tool(
    "ai-extract-data",
    "Extract data",
    "ai",
    "Invoices, receipts and resumes to JSON, CSV or Excel.",
    ["pdf", "image"],
    ["invoice", "receipt"],
  ),
  tool(
    "ai-rename",
    "AI rename",
    "ai",
    "Get clear, consistent filenames suggested.",
    ["pdf"],
    ["filename"],
  ),
  tool(
    "ai-categorize",
    "Auto-categorize",
    "ai",
    "Sort documents into categories automatically.",
    ["pdf"],
    ["classify"],
  ),
  tool(
    "image-compress",
    "Compress image",
    "image",
    "Smaller images with no visible loss.",
    ["image"],
    ["optimize"],
  ),
  tool(
    "image-resize",
    "Resize image",
    "image",
    "Exact dimensions or percentages.",
    ["image"],
    ["scale"],
  ),
  tool("image-crop", "Crop image", "image", "Crop to any ratio visually.", ["image"], ["trim"]),
  tool(
    "image-convert",
    "Convert image",
    "image",
    "Between JPG, PNG, WebP, TIFF and more.",
    ["image"],
    ["format"],
  ),
  tool(
    "image-remove-background",
    "Remove background",
    "image",
    "Cut out subjects cleanly.",
    ["image"],
    ["transparent"],
  ),
  tool(
    "image-watermark",
    "Watermark image",
    "image",
    "Protect images with text or logos.",
    ["image"],
    ["stamp"],
  ),
  tool("image-rotate", "Rotate image", "image", "Rotate and flip images.", ["image"], ["turn"]),
  tool("remove-duplicate-pages", "Remove duplicate pages", "organize", "Delete repeated pages and keep the first copy.", ["pdf"], ["duplicate", "repeat", "dedupe"]),
  tool("remove-images", "Remove images", "optimize", "Strip pictures and keep the text.", ["pdf"], ["pictures", "photos"]),
  tool("remove-hidden-data", "Remove JavaScript and hidden data", "optimize", "Remove scripts, attachments and metadata before sharing.", ["pdf"], ["javascript", "sanitize", "metadata", "privacy"]),
  tool("interleave-pages", "Interleave odd and even scans", "organize", "Combine front-side and back-side scans into one document.", ["pdf"], ["duplex", "odd", "even", "scan", "collate"]),
  tool("image-add-text", "Add text to image", "image", "Add a caption or title to an image.", ["image"], ["caption", "title", "text", "meme"]),
  tool("digital-sign", "Digital signature", "security", "Sign with your own certificate (.p12 or .pfx).", ["pdf"], ["certificate", "pkcs12", "pfx", "cryptographic"]),
  tool("verify-signatures", "Verify signatures", "security", "Check the digital signatures in a PDF.", ["pdf"], ["validate", "certificate", "integrity"]),
  tool("create-form", "Create fillable form", "edit", "Add form fields to any PDF.", ["pdf"], ["acroform", "fields", "checkbox", "dropdown"]),
  tool("detect-form-fields", "Auto-detect form fields", "edit", "Turn blanks and boxes into fillable fields.", ["pdf"], ["fillable", "blanks", "lines", "convert"]),
  tool("ai-key-dates", "Key dates extractor", "ai", "Find deadlines and export them as a calendar file.", ["pdf"], ["calendar", "ics", "deadline", "renewal"]),
];

export function findTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((entry) => entry.slug === slug);
}

export function categoryOf(id: ToolCategoryId): ToolCategory {
  const found = TOOL_CATEGORIES.find((category) => category.id === id);
  if (!found) throw new Error(`Unknown category ${id}`);
  return found;
}

export function searchTools(
  tools: ToolDefinition[],
  query: string,
  category: ToolCategoryId | "all",
): ToolDefinition[] {
  const needle = query.trim().toLowerCase();
  return tools.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (!needle) return true;
    const haystack = [entry.name, entry.description, ...entry.keywords].join(" ").toLowerCase();
    return needle.split(/\s+/).every((word) => haystack.includes(word));
  });
}

const EXTENSION_KINDS: Record<string, FileKind> = {
  pdf: "pdf",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  tif: "image",
  tiff: "image",
  bmp: "image",
  gif: "image",
  heic: "image",
  heif: "image",
  doc: "word",
  docx: "word",
  odt: "word",
  rtf: "word",
  xls: "excel",
  xlsx: "excel",
  ods: "excel",
  csv: "excel",
  ppt: "powerpoint",
  pptx: "powerpoint",
  odp: "powerpoint",
  html: "html",
  htm: "html",
  txt: "text",
  md: "text",
  markdown: "text",
  epub: "epub",
};

export function detectFileKind(file: { name: string; type: string }): FileKind | null {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_KINDS[extension] ?? null;
}

const SUGGESTION_ORDER: Record<FileKind, string[]> = {
  pdf: [
    "merge",
    "compress",
    "split",
    "pdf-to-word",
    "edit-pdf",
    "sign",
    "protect",
    "ocr",
    "rotate",
    "ai-summarize",
  ],
  image: [
    "image-to-pdf",
    "image-compress",
    "image-resize",
    "image-convert",
    "ocr",
    "image-remove-background",
  ],
  word: ["word-to-pdf"],
  excel: ["excel-to-pdf"],
  powerpoint: ["powerpoint-to-pdf"],
  html: ["html-to-pdf"],
  text: ["markdown-to-pdf", "text-to-pdf"],
  epub: ["epub-to-pdf"],
};

export function suggestTools(kinds: FileKind[], fileCount: number): ToolDefinition[] {
  const unique = Array.from(new Set(kinds));
  if (unique.length === 0) return [];
  const slugs = unique.length === 1 ? SUGGESTION_ORDER[unique[0]] : ["merge", "image-to-pdf"];
  return slugs
    .map((slug) => findTool(slug))
    .filter((entry): entry is ToolDefinition => entry !== undefined)
    .filter((entry) => entry.minFiles <= fileCount)
    .filter((entry) => unique.every((kind) => entry.accepts.includes(kind)));
}
