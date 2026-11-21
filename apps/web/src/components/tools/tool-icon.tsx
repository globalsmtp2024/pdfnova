import {
  Archive,
  BookText,
  CodeXml,
  Droplet,
  FileType,
  FlipHorizontal,
  Frame,
  MonitorPlay,
  Pilcrow,
  Table2,
  TextQuote,
  BadgeCheck,
  Bookmark,
  BookOpen,
  Braces,
  Code2,
  Combine,
  Contrast,
  Crop,
  Droplets,
  Eraser,
  Expand,
  EyeOff,
  FileCode2,
  FileImage,
  FileLock2,
  FileMinus2,
  FileOutput,
  FilePen,
  FileSpreadsheet,
  FileText,
  FormInput,
  Gauge,
  GitCompare,
  Globe,
  Grid2x2,
  Hash,
  Image,
  ImageDown,
  ImageMinus,
  Images,
  Info,
  Languages,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  LockOpen,
  MessageSquareText,
  Minimize2,
  PaintBucket,
  PanelTop,
  Paperclip,
  PenLine,
  Presentation,
  Repeat,
  RotateCw,
  Scaling,
  ScanLine,
  ScanText,
  Scissors,
  Sheet,
  ShieldAlert,
  Signature,
  Sparkles,
  Split,
  SquarePlus,
  Stamp,
  Tags,
  TextCursorInput,
  Type,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { createElement } from "react";

import { categoryOf, findTool } from "@/config/tools";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  merge: Combine,
  split: Split,
  "remove-pages": FileMinus2,
  "extract-pages": FileOutput,
  organize: LayoutGrid,
  "scan-to-pdf": ScanLine,
  compress: Minimize2,
  repair: Wrench,
  ocr: ScanText,
  flatten: Layers,
  linearize: Gauge,
  "remove-metadata": Eraser,
  grayscale: Contrast,
  "image-to-pdf": Image,
  "word-to-pdf": FileText,
  "powerpoint-to-pdf": Presentation,
  "excel-to-pdf": Sheet,
  "html-to-pdf": Code2,
  "url-to-pdf": Globe,
  "markdown-to-pdf": FileCode2,
  "text-to-pdf": Type,
  "epub-to-pdf": BookOpen,
  "pdf-to-image": Images,
  "pdf-to-word": FileType,
  "pdf-to-powerpoint": MonitorPlay,
  "pdf-to-excel": FileSpreadsheet,
  "pdf-to-pdfa": Archive,
  "pdf-to-markdown": Pilcrow,
  "pdf-to-html": CodeXml,
  "pdf-to-text": TextQuote,
  "pdf-to-csv": Table2,
  "pdf-to-epub": BookText,
  rotate: RotateCw,
  "page-numbers": Hash,
  watermark: Droplets,
  crop: Crop,
  "edit-pdf": FilePen,
  "fill-forms": FormInput,
  "create-forms": SquarePlus,
  "header-footer": PanelTop,
  "bates-numbering": Stamp,
  background: PaintBucket,
  "resize-pages": Scaling,
  "n-up": Grid2x2,
  bookmarks: Bookmark,
  "edit-metadata": Info,
  attachments: Paperclip,
  hyperlinks: Link2,
  protect: Lock,
  unlock: LockOpen,
  sign: PenLine,
  "digital-signature": Signature,
  redact: EyeOff,
  compare: GitCompare,
  "verify-signature": BadgeCheck,
  "ai-summarize": Sparkles,
  "ai-translate": Languages,
  "ai-chat": MessageSquareText,
  "ai-smart-split": Scissors,
  "ai-smart-redact": ShieldAlert,
  "ai-extract-data": Braces,
  "ai-rename": TextCursorInput,
  "ai-categorize": Tags,
  "image-compress": ImageDown,
  "image-resize": Expand,
  "image-crop": Frame,
  "image-convert": Repeat,
  "image-remove-background": ImageMinus,
  "image-watermark": Droplet,
  "image-rotate": FlipHorizontal,
};

export const TOOL_ICON_SLUGS = Object.keys(ICONS);

export function iconFor(slug: string): LucideIcon {
  return (
    ICONS[slug] ??
    (slug.startsWith("ai-") ? WandSparkles : slug.startsWith("image") ? FileImage : FileLock2)
  );
}

export function ToolIcon({
  slug,
  size = "md",
  className,
}: {
  slug: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const definition = findTool(slug);
  const color = definition ? categoryOf(definition.category).color : "#5B4BFF";
  return (
    <span
      aria-hidden
      data-tool-icon={slug}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl transition-[box-shadow,transform] duration-300 ease-(--ease-spring) group-hover:-translate-y-0.5",
        size === "sm" && "size-8 rounded-lg [&_svg]:size-4",
        size === "md" && "size-11 [&_svg]:size-5",
        size === "lg" && "size-14 rounded-2xl [&_svg]:size-7",
        size === "xl" && "size-18 rounded-2xl [&_svg]:size-9",
        className,
      )}
      style={{
        background: `linear-gradient(140deg, color-mix(in srgb, ${color} 22%, var(--surface)), color-mix(in srgb, ${color} 8%, var(--surface)))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent), 0 8px 22px -10px color-mix(in srgb, ${color} 55%, transparent)`,
        color: `color-mix(in srgb, ${color} 78%, var(--foreground))`,
      }}
    >
      {createElement(iconFor(slug), { strokeWidth: 1.9 })}
    </span>
  );
}
