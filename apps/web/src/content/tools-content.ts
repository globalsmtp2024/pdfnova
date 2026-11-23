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
      "Drag files into order and pick page ranges and rotation, or switch to page mode to arrange single pages across files.",
      "Choose how bookmarks and form fields are handled, then press Merge PDF and download one combined document.",
    ],
    highlights: [
      {
        title: "Per-file page ranges",
        body: "Include only the pages you need from each file, like 1-3, 5 or 8-last.",
      },
      {
        title: "Page-by-page mode",
        body: "Expand every file into pages, then reorder, rotate or delete pages across all files before merging.",
      },
      {
        title: "Bookmarks your way",
        body: "Add one bookmark per file, keep the original bookmarks, or both nested together.",
      },
      {
        title: "Fillable forms keep working",
        body: "Form fields stay fillable after merging, with clashing names renamed automatically. Or drop them for a clean copy.",
      },
      {
        title: "Up to 100 files",
        body: "Merge large batches in one go, in exactly the order you set, with an output size estimate before you start.",
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
          "Yes. Protected files are detected on upload and ask for their password right on the file card. The password is used only for this task, and the merged PDF is saved without a password.",
      },
      {
        question: "What happens to fillable form fields?",
        answer:
          "By default fields are kept and stay fillable. If two files use the same field name, the later one is renamed with its file number, like 2_name. You can also choose to remove all form fields.",
      },
      ...SHARED_FAQ(findTool("merge") as ToolDefinition),
    ],
  },
  compress: {
    steps: [
      "Drop one or more PDFs, or click to choose them.",
      "Pick Low, Recommended or Extreme, or enter a target size.",
      "Press Compress PDF and download the smaller file.",
    ],
    highlights: [
      {
        title: "Three strength levels",
        body: "Low, recommended and extreme, plus a target size when you need one.",
      },
      {
        title: "Smart image handling",
        body: "Photos are resampled to the size they are shown on the page and re-encoded, while text and vector graphics stay crisp and searchable.",
      },
      {
        title: "See the savings",
        body: "Before and after sizes, the percentage saved and a first-page comparison appear the moment it finishes.",
      },
      {
        title: "Never bigger",
        body: "If a file can't be made smaller, you get the original back untouched.",
      },
    ],
    faq: [
      {
        question: "Which level should I choose?",
        answer:
          "Recommended suits most documents. Low keeps images close to the original, Extreme gives the smallest files for on-screen reading.",
      },
      {
        question: "Will my text stay selectable?",
        answer:
          "Yes. Only images are resampled; text, fonts and links are kept, so the PDF stays searchable.",
      },
      {
        question: "What if my target size can't be reached?",
        answer:
          "You get the smallest version we could make, and the result shows the actual size so you can decide.",
      },
      ...SHARED_FAQ(findTool("compress") as ToolDefinition),
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
  repair: {
    steps: [
      "Drop the damaged PDF, even if other tools refuse to open it.",
      "Optionally allow unreadable pages to be rebuilt as images.",
      "Press Repair PDF and download the fixed file with its repair report.",
    ],
    highlights: [
      {
        title: "Several recovery engines",
        body: "qpdf structural recovery runs first, then two independent PDF readers and finally page-level salvage.",
      },
      {
        title: "Honest report",
        body: "repair-report.txt lists every problem found and fixed and how many pages were recovered.",
      },
      {
        title: "No silent page loss",
        body: "The recovered page count is compared with the page tree and the page objects in the file, and any gap is reported.",
      },
    ],
    faq: [
      {
        question: "What kinds of damage can be fixed?",
        answer:
          "Broken or wrong cross-reference tables, missing trailers, wrong stream lengths, objects missing their end marker, junk appended after the end of the file and many truncated downloads.",
      },
      {
        question: "What if my file is not actually damaged?",
        answer:
          "The report says No problems found and you still get a clean, re-saved copy of the document.",
      },
      {
        question: "Will my text stay selectable?",
        answer:
          "Yes. Pages are rebuilt from their original objects. Only if you allow it, a page that cannot be copied any other way is rebuilt as an image, and the report names it.",
      },
      ...SHARED_FAQ(findTool("repair") as ToolDefinition),
    ],
  },
  "page-numbers": {
    steps: [
      "Drop one or more PDFs.",
      "Pick a position on the 3×3 grid, a format like Page 1 of N, the font and which pages to number. The preview updates as you go.",
      "Press Add page numbers and download the numbered PDF.",
    ],
    highlights: [
      {
        title: "Real, searchable text",
        body: "Numbers are drawn with embedded fonts, so they stay sharp and can be selected and searched.",
      },
      {
        title: "Any format",
        body: "1, Page 1, 1 / N, Page 1 of N, roman numerals, letters or your own template with {n} and {total}.",
      },
      {
        title: "Urdu and Arabic labels",
        body: "Right-to-left labels like صفحہ {n} are shaped correctly, with Arabic-Indic digits if you want them.",
      },
      {
        title: "Skip what you need",
        body: "Start at any number, skip covers or the last pages, number odd or even pages, or use a page range.",
      },
    ],
    faq: [
      {
        question: "Do numbers land correctly on rotated or landscape pages?",
        answer:
          "Yes. Placement follows the page as you see it, so labels stay upright in the chosen corner on rotated, landscape and cropped pages.",
      },
      {
        question: "What does {total} count?",
        answer:
          "The number the last numbered page receives. If you skip the final pages, they are not counted.",
      },
      {
        question: "Can I mirror numbers for printed books?",
        answer:
          "Yes. Turn on mirror margins and left and right positions swap on even pages, like a printed book.",
      },
      ...SHARED_FAQ(findTool("page-numbers") as ToolDefinition),
    ],
  },
  watermark: {
    steps: [
      "Drop one or more PDFs.",
      "Type your watermark text or choose a PNG or JPG, then set size, opacity, rotation and position, or tile it across the page.",
      "Press Add watermark and download the stamped PDF.",
    ],
    highlights: [
      {
        title: "Text or image",
        body: "Use any text, in several lines and languages including Urdu, or your logo as PNG or JPG.",
      },
      {
        title: "Tiled or placed",
        body: "Place it once on a 9-point grid with offsets, or repeat it across the page at an angle.",
      },
      {
        title: "Over or under content",
        body: "Stamp on top of everything or slip it behind the page content like a paper watermark.",
      },
      {
        title: "Light output",
        body: "The watermark is stored once and reused on every page, so files stay small.",
      },
    ],
    faq: [
      {
        question: "Can I use an SVG logo?",
        answer:
          "Not directly. Export it as PNG with a transparent background and it will keep its transparency.",
      },
      {
        question: "Why can't I see an under-content watermark?",
        answer:
          "Some pages, such as scans, are fully covered by an image. Choose over content and lower the opacity instead.",
      },
      {
        question: "Can I watermark only some pages?",
        answer:
          "Yes. Use a page range, odd or even pages, and skip the first page if it is a cover.",
      },
      ...SHARED_FAQ(findTool("watermark") as ToolDefinition),
    ],
  },
  crop: {
    steps: [
      "Drop one or more PDFs.",
      "Drag the crop frame on the page preview, type margins in mm, pt, inches or %, or pick Remove margins.",
      "Choose visual or permanent cropping and the pages to crop, then download.",
    ],
    highlights: [
      {
        title: "Visual or permanent",
        body: "Visual cropping only changes the CropBox, so it can be undone. Permanent cropping resizes every page box and clips the content.",
      },
      {
        title: "Remove margins",
        body: "Each page is rendered, its non-white area is found and the crop fits that content with a small padding.",
      },
      {
        title: "Rotated pages handled",
        body: "You crop what you see. Rotated pages and unusual page origins are mapped correctly.",
      },
    ],
    faq: [
      {
        question: "Is the cropped-away content deleted?",
        answer:
          "No. Visual mode only hides it with the CropBox. Permanent mode clips it so viewers and printers can't show it, but the text and images stay inside the file. Annotations lying entirely outside the crop are deleted in permanent mode.",
      },
      {
        question: "Can I crop only some pages?",
        answer:
          "Yes. Apply the crop to all pages, the page you are previewing, odd or even pages, or a range like 2-5, 9.",
      },
      ...SHARED_FAQ(findTool("crop") as ToolDefinition),
    ],
  },
  protect: {
    steps: [
      "Drop one or more PDFs. A file that already has a password asks for it first.",
      "Type an open password twice or generate a strong one, then choose what readers may do.",
      "Press Protect PDF and download the encrypted files.",
    ],
    highlights: [
      {
        title: "AES-256 encryption",
        body: "Files are encrypted with AES-256, the strongest standard PDF encryption, and checked before you download them.",
      },
      {
        title: "Permission control",
        body: "Allow or block printing, high-quality printing, copying, editing, comments, form filling and page assembly.",
      },
      {
        title: "Password never stored",
        body: "Your password is sealed for the job, used once and wiped. It never appears in our database, logs or results.",
      },
    ],
    faq: [
      {
        question: "Can you recover a lost password?",
        answer:
          "No. We never keep the password, so nobody can recover it. Store it somewhere safe before you download.",
      },
      {
        question: "What is the owner password for?",
        answer:
          "It lets the owner change permissions later. If you leave it empty, a random strong owner password is created and thrown away.",
      },
      {
        question: "Do all PDF readers respect the permissions?",
        answer:
          "The open password is always enforced. Permissions are honoured by standard readers, but some editors can ignore them, so rely on the open password for secrecy.",
      },
      ...SHARED_FAQ(findTool("protect") as ToolDefinition),
    ],
  },
  unlock: {
    steps: [
      "Drop up to 50 PDFs. Files that need a password to open ask for it right away.",
      "Type the password you already know for each locked file. Files with only editing restrictions need nothing.",
      "Press Unlock PDF and download copies that open without a password and allow printing, copying and editing.",
    ],
    highlights: [
      {
        title: "Restrictions removed",
        body: "Printing, copying and editing limits set by an owner password are removed, so the copy behaves like a normal PDF.",
      },
      {
        title: "Passwords stay private",
        body: "The password you type is sealed for this one task, never written to logs and wiped as soon as the file is unlocked.",
      },
      {
        title: "Batch friendly",
        body: "Unlock up to 50 files at once. A file with a wrong or missing password is listed in a report while the rest finish.",
      },
    ],
    faq: [
      {
        question: "Can you unlock a PDF if I forgot the password?",
        answer:
          "No. We never guess, crack or brute-force passwords. A file that needs a password to open can only be unlocked with the correct password you enter.",
      },
      {
        question: "Which files can I unlock?",
        answer:
          "Only files you own or have the right to modify. Removing protection from someone else's document without permission may break the law or an agreement.",
      },
      {
        question: "What happens to a file with only editing restrictions?",
        answer:
          "It opens without a password, so no prompt is shown. The copy you download has every restriction removed.",
      },
      ...SHARED_FAQ(findTool("unlock") as ToolDefinition),
    ],
  },
  flatten: {
    steps: [
      "Drop one or more PDFs with forms, comments or stamps.",
      "Choose what to flatten: form fields, comments and annotations, stamps, and whether links stay clickable.",
      "Press Flatten PDF and download a document whose content can no longer be edited.",
    ],
    highlights: [
      {
        title: "Values stay visible",
        body: "Missing field appearances are generated first, so every filled value is burned into the page exactly as shown.",
      },
      {
        title: "Choose what to lock",
        body: "Flatten forms, comments or stamps separately, and keep hyperlinks working if you like.",
      },
      {
        title: "Batch friendly",
        body: "Flatten up to 100 files at once. If one file fails, the rest still finish.",
      },
    ],
    faq: [
      {
        question: "What does flattening do?",
        answer:
          "It draws form fields, comments and stamps into the page itself and removes the interactive objects, so nobody can change the values afterwards.",
      },
      {
        question: "Is the form removed?",
        answer:
          "When form fields are flattened the interactive form is removed completely; the filled-in values remain as ordinary page content.",
      },
      {
        question: "Can I keep links clickable?",
        answer: "Yes. Links are kept by default; turn the option off to remove them too.",
      },
      ...SHARED_FAQ(findTool("flatten") as ToolDefinition),
    ],
  },
  "edit-metadata": {
    steps: [
      "Drop one or more PDFs.",
      "Edit title, author, subject, keywords, dates and custom properties, or remove all metadata and hidden data.",
      "Compare before and after, then press Edit metadata and download the result.",
    ],
    highlights: [
      {
        title: "Before and after",
        body: "See the current properties next to the values you are about to apply.",
      },
      {
        title: "Info and XMP in sync",
        body: "Document information and XMP metadata are updated together, so every viewer shows the same values.",
      },
      {
        title: "Hidden data clean-up",
        body: "Remove attachments, JavaScript and page thumbnails, with a count of what was found.",
      },
    ],
    faq: [
      {
        question: "What does Remove all metadata clear?",
        answer:
          "Every document property plus the XMP metadata stored for the document and for individual pages.",
      },
      {
        question: "What date format is used?",
        answer:
          "PDF dates look like D:YYYYMMDDHHmmSS, for example D:20240131093000, optionally followed by a time zone.",
      },
      {
        question: "Can I add my own properties?",
        answer:
          "Yes. Add up to 50 custom properties with names made of letters, digits, dots, dashes or underscores.",
      },
      ...SHARED_FAQ(findTool("edit-metadata") as ToolDefinition),
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
