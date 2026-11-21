import { findTool, TOOLS, type ToolCategoryId, type ToolDefinition } from "@/config/tools";
import { URDU_TOOL_CONTENT, type LocalizedToolContent } from "@/content/tools-content.ur";

export const LOCALIZED_CONTENT: Record<string, Record<string, LocalizedToolContent>> = {
  ur: URDU_TOOL_CONTENT,
};

export type ToolContent = {
  steps: [string, string, string];
  highlights: { title: string; body: string }[];
  faq: { question: string; answer: string }[];
  related: string[];
};

type Template = (tool: ToolDefinition) => Omit<ToolContent, "related">;

const SHARED_FAQ = (tool: ToolDefinition) => [
  {
    question: `Is ${tool.name} free?`,
    answer:
      "Yes. Every tool is free for everyone with no watermark and no sign-up. Fair-use limits only protect the servers.",
  },
  {
    question: "What happens to my files?",
    answer:
      "They are encrypted at rest, processed in an isolated sandbox and deleted automatically one hour after processing, or instantly when you press Delete now.",
  },
];

const CATEGORY_TEMPLATES: Record<ToolCategoryId, Template> = {
  organize: (tool) => ({
    steps: [
      "Drop your PDF files or click to choose them.",
      "Arrange files and pick the pages you want.",
      `Press ${tool.name} and download the result.`,
    ],
    highlights: [
      {
        title: "Exact page control",
        body: "Use simple ranges like 1-3, 5, 8-last to choose exactly what goes in.",
      },
      {
        title: "Keeps quality intact",
        body: "Pages are copied as they are, without re-rendering or recompressing.",
      },
      {
        title: "Bookmarks respected",
        body: "Existing outlines are preserved wherever they still point to a page.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Does it change the quality of my pages?",
        answer:
          "No. Pages are reorganized without being re-rendered, so text stays sharp and searchable.",
      },
    ],
  }),
  optimize: (tool) => ({
    steps: [
      "Drop the PDF you want to improve.",
      "Choose how strong the optimization should be.",
      `Press ${tool.name} and compare before and after.`,
    ],
    highlights: [
      {
        title: "Sensible defaults",
        body: "Recommended settings balance file size and quality for everyday use.",
      },
      {
        title: "Before and after",
        body: "See the size difference as soon as processing finishes.",
      },
      {
        title: "Safe processing",
        body: "Damaged or unusual files are inspected before processing to keep things stable.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Will text stay selectable?",
        answer: "Yes. Optimization keeps text, links and bookmarks wherever the source has them.",
      },
    ],
  }),
  convert_to_pdf: (tool) => ({
    steps: [
      "Drop the files you want to convert.",
      "Choose page size, orientation and margins if needed.",
      "Download a clean, shareable PDF.",
    ],
    highlights: [
      {
        title: "Faithful layout",
        body: "Fonts, spacing and images are kept as close to the original as possible.",
      },
      {
        title: "Batch friendly",
        body: "Convert many files at once and download them together as a ZIP.",
      },
      {
        title: "Universal output",
        body: "PDFs open the same way on every device and operating system.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Can I combine several files into one PDF?",
        answer:
          "Yes. Convert them first, then use Merge PDF, or use a workflow to do both in one run.",
      },
    ],
  }),
  convert_from_pdf: (tool) => ({
    steps: [
      "Drop the PDF you want to convert.",
      "Pick the output format and options.",
      "Download the converted file, ready to edit.",
    ],
    highlights: [
      {
        title: "Editable results",
        body: "Real paragraphs, tables and images instead of one big picture.",
      },
      {
        title: "Scanned files too",
        body: "Combine with OCR for documents that were scanned or photographed.",
      },
      {
        title: "Keeps structure",
        body: "Headings, lists and tables are detected and rebuilt where possible.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "What about scanned PDFs?",
        answer: "Run OCR first to add a text layer, then convert for the best results.",
      },
    ],
  }),
  edit: (tool) => ({
    steps: [
      "Drop the PDF you want to edit.",
      "Adjust the settings and preview the result.",
      `Apply ${tool.name} and download.`,
    ],
    highlights: [
      {
        title: "No desktop software",
        body: "Everything happens in your browser and our secure processing service.",
      },
      {
        title: "Precise placement",
        body: "Control position, size, rotation and which pages are affected.",
      },
      {
        title: "Non-destructive",
        body: "Your original file is never changed; you always get a new copy.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Can I apply it to only some pages?",
        answer: "Yes. Use page ranges like 1-3, 7 or 10-last to target specific pages.",
      },
    ],
  }),
  security: (tool) => ({
    steps: [
      "Drop the PDF you want to secure.",
      "Choose passwords, permissions or signature options.",
      "Download the protected document.",
    ],
    highlights: [
      { title: "Strong encryption", body: "AES-256 is used wherever the PDF format supports it." },
      {
        title: "Private processing",
        body: "Passwords are never stored and files are deleted automatically.",
      },
      { title: "Standards based", body: "Results open correctly in every major PDF reader." },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Do you keep my password?",
        answer: "No. Passwords are used only for the task and are never stored or logged.",
      },
    ],
  }),
  ai: (tool) => ({
    steps: [
      "Drop the document you want help with.",
      "Tell the AI what you need.",
      "Review the result, with references back to the source pages.",
    ],
    highlights: [
      {
        title: "Grounded answers",
        body: "Results point back to the pages they came from so you can check them.",
      },
      {
        title: "Your key, optional",
        body: "Use the shared fair-use allowance or add your own provider key in Settings.",
      },
      {
        title: "Private by default",
        body: "Documents are deleted automatically after processing.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Is there a limit on AI requests?",
        answer:
          "A daily fair-use cap applies to the shared AI allowance. Adding your own key in Settings removes that cap.",
      },
    ],
  }),
  image: (tool) => ({
    steps: [
      "Drop your images or click to choose them.",
      "Adjust size, format or quality.",
      "Download the results, individually or as a ZIP.",
    ],
    highlights: [
      { title: "Common formats", body: "JPG, PNG, WebP, TIFF, BMP and HEIC are supported." },
      { title: "Batch processing", body: "Process up to 100 images at once with per-file status." },
      {
        title: "Quality you choose",
        body: "Pick the balance between file size and visual quality.",
      },
    ],
    faq: [
      ...SHARED_FAQ(tool),
      {
        question: "Is image metadata kept?",
        answer: "You choose. Location and camera details can be removed for privacy.",
      },
    ],
  }),
};

const OVERRIDES: Partial<Record<string, Partial<Omit<ToolContent, "related">>>> = {
  merge: {
    steps: [
      "Drop two or more PDFs, or click to choose them.",
      "Drag files into order, pick page ranges and rotation for each.",
      "Press Merge PDF and download one combined document.",
    ],
    highlights: [
      {
        title: "Per-file page ranges",
        body: "Include only the pages you need from each file, like 1-3, 5 or 8-last.",
      },
      {
        title: "Bookmarks for every file",
        body: "Each source gets a bookmark, with its own outline nested underneath.",
      },
      {
        title: "Rotate while merging",
        body: "Fix sideways scans as you combine, without a separate step.",
      },
      {
        title: "Up to 100 files",
        body: "Merge large batches in one go, in exactly the order you set.",
      },
    ],
    faq: [
      {
        question: "Is there a limit to how many PDFs I can merge?",
        answer: "You can merge up to 100 files per task, each up to 200 MB.",
      },
      {
        question: "Will my bookmarks survive?",
        answer:
          "Yes. Existing bookmarks are kept and nested under a new bookmark for each file, unless you turn that off.",
      },
      {
        question: "Can I merge password-protected PDFs?",
        answer:
          "Protected files are detected on upload. Unlock them first with Unlock PDF, then merge.",
      },
      ...SHARED_FAQ(findTool("merge") as ToolDefinition),
    ],
  },
  compress: {
    highlights: [
      {
        title: "Three strength levels",
        body: "Low, recommended and extreme, plus a target size when you need one.",
      },
      {
        title: "Smart image handling",
        body: "Images are resampled and re-encoded while text stays crisp.",
      },
      {
        title: "See the savings",
        body: "Before and after sizes are shown the moment it finishes.",
      },
    ],
  },
  split: {
    steps: [
      "Drop one PDF, or click to choose it.",
      "Pick how to split: ranges, every N pages, file size, bookmarks, blank pages or every page. Click the scissors between pages to place split points.",
      "Press Split PDF and download the parts as a ZIP.",
    ],
    highlights: [
      {
        title: "Every way to split",
        body: "By range, every N pages, by size, by bookmarks or at blank pages.",
      },
      {
        title: "Visual split points",
        body: "Click between page thumbnails to cut exactly where you want, with a live count of the files you'll get.",
      },
      {
        title: "Names you control",
        body: "Parts are named like report_part-01_pages-1-5.pdf, and you can change the pattern.",
      },
      {
        title: "Bookmarks kept",
        body: "Each part keeps the bookmarks that point into its pages, plus the original document info.",
      },
    ],
    faq: [
      {
        question: "How does split by file size work?",
        answer:
          "We group consecutive pages and measure each candidate part, keeping every part at or under the size you set. A single page larger than the limit becomes its own part.",
      },
      {
        question: "What counts as a blank page?",
        answer:
          "A page with no text whose rendered image is almost entirely white. You can tune the sensitivity and choose whether separator pages are dropped.",
      },
      {
        question: "Can I split a password-protected PDF?",
        answer:
          "Yes. Enter the password when asked; it is used only for this task and never stored.",
      },
      ...SHARED_FAQ(findTool("split") as ToolDefinition),
    ],
  },
  rotate: {
    steps: [
      "Drop one or more PDFs.",
      "Choose 90° right, 180° or 90° left, then pick pages, odd or even, or rotate single pages from their thumbnails.",
      "Press Rotate PDF and download the result.",
    ],
    highlights: [
      {
        title: "Lossless",
        body: "Only the page rotation flag changes. Text, images and quality stay exactly as they were.",
      },
      {
        title: "Per-page control",
        body: "Rotate individual pages from the thumbnail grid and see the preview turn instantly.",
      },
      {
        title: "Batch friendly",
        body: "Apply the same rotation to up to 100 files. If one file fails, the rest still finish.",
      },
    ],
    faq: [
      {
        question: "Does rotating reduce quality?",
        answer: "No. Pages are not re-rendered; the rotation is stored as page information.",
      },
      {
        question: "Is rotation relative to the current orientation?",
        answer: "Yes. 90° right turns each chosen page a quarter turn from where it is now.",
      },
      ...SHARED_FAQ(findTool("rotate") as ToolDefinition),
    ],
  },
  "remove-pages": {
    steps: [
      "Drop one PDF.",
      "Click the pages to delete, or type them, like 2-4, 10 or even.",
      "Press Remove pages and download the shorter PDF.",
    ],
    highlights: [
      {
        title: "See what goes",
        body: "Pages marked for removal are struck through in red before anything changes.",
      },
      {
        title: "Bookmarks fixed",
        body: "Bookmarks to removed pages are dropped; the rest point at the right pages.",
      },
      {
        title: "Never empty",
        body: "Removing every page is blocked, so you can't end up with an empty file.",
      },
    ],
    faq: [
      {
        question: "What happens to links and bookmarks to deleted pages?",
        answer:
          "Bookmarks pointing at removed pages are dropped and the remaining outline is rebuilt, so nothing points at a missing page.",
      },
      ...SHARED_FAQ(findTool("remove-pages") as ToolDefinition),
    ],
  },
  "extract-pages": {
    steps: [
      "Drop one PDF.",
      "Select the pages to keep in the grid or type a range.",
      "Choose one new PDF or a separate file per page, then download.",
    ],
    highlights: [
      {
        title: "Your order",
        body: "Typed ranges are kept in the order you write them, like 8, 2, 5.",
      },
      {
        title: "Faithful copies",
        body: "Page boxes, rotation, annotations and form fields come along unchanged.",
      },
      {
        title: "One file or many",
        body: "Get a single PDF or a ZIP with one file per page.",
      },
    ],
    faq: [
      {
        question: "Is the original changed?",
        answer:
          "No. Extract creates new files and leaves your upload untouched until it is deleted.",
      },
      ...SHARED_FAQ(findTool("extract-pages") as ToolDefinition),
    ],
  },
  organize: {
    steps: [
      "Drop one or more PDFs.",
      "Drag pages into order, rotate, duplicate, delete or insert blank pages. Undo anything.",
      "Press Organize PDF and download the new document.",
    ],
    highlights: [
      {
        title: "Mix files",
        body: "Pages from several PDFs appear together, so you can interleave and rearrange freely.",
      },
      {
        title: "Undo and redo",
        body: "Up to 50 steps, with Ctrl+Z and Ctrl+Y, and your edit survives a page refresh.",
      },
      {
        title: "Keyboard accessible",
        body: "Move pages with the keyboard; every move is announced to screen readers.",
      },
    ],
    faq: [
      {
        question: "Can I add pages from another PDF?",
        answer: "Yes. Add more files and their pages join the editor, ready to drag into place.",
      },
      {
        question: "What size are inserted blank pages?",
        answer: "The same size as the page just before them.",
      },
      ...SHARED_FAQ(findTool("organize") as ToolDefinition),
    ],
  },
  "pdf-to-word": {
    highlights: [
      {
        title: "Real paragraphs",
        body: "Text flows as editable paragraphs, not one text box per line.",
      },
      { title: "Tables rebuilt", body: "Tables become real Word tables you can edit and resize." },
      { title: "Scans supported", body: "OCR turns scanned pages into editable text first." },
    ],
  },
};

const RELATED_BY_CATEGORY = (tool: ToolDefinition): string[] =>
  TOOLS.filter((candidate) => candidate.category === tool.category && candidate.slug !== tool.slug)
    .slice(0, 4)
    .map((candidate) => candidate.slug);

export function getToolContent(slug: string, locale = "en"): ToolContent | null {
  const tool = findTool(slug);
  if (!tool) return null;
  const localized = LOCALIZED_CONTENT[locale]?.[slug];
  if (localized) return { ...localized, related: RELATED_BY_CATEGORY(tool) };
  const base = CATEGORY_TEMPLATES[tool.category](tool);
  const override = OVERRIDES[slug] ?? {};
  return {
    steps: override.steps ?? base.steps,
    highlights: override.highlights ?? base.highlights,
    faq: override.faq ?? base.faq,
    related: RELATED_BY_CATEGORY(tool),
  };
}
