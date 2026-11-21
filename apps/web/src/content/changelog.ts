export type ReleaseStatus = "shipped" | "in-progress" | "planned";

export type Release = {
  version: string;
  date: string;
  status: ReleaseStatus;
  title: string;
  summary: string;
  highlights: string[];
  tools: string[];
};

export const RELEASES: Release[] = [
  {
    version: "0.3.0",
    date: "Next",
    status: "in-progress",
    title: "Core PDF tools",
    summary: "The everyday essentials, with page thumbnails and drag-to-reorder everywhere.",
    highlights: [
      "Split, remove and extract pages, organize, rotate",
      "Compress, repair and flatten",
      "Page numbers, watermark and crop",
      "Protect, unlock and metadata editing",
    ],
    tools: [],
  },
  {
    version: "0.2.0",
    date: "2026-11-19",
    status: "shipped",
    title: "Free for everyone, and a brand new look",
    summary:
      "Every tool and feature is now free. A single fair-use policy replaces plans, and the whole site was redesigned.",
    highlights: [
      "No paid plans: generous fair-use limits with clear reset times",
      "Optional accounts with history, API keys, 24-hour retention and data export",
      "Bring your own AI key to skip the shared AI cap",
      "Import files from a public link, with protection against internal network access",
      "Redesigned site with a command palette, mega menu and Urdu with right-to-left layout",
    ],
    tools: [],
  },
  {
    version: "0.1.0",
    date: "2026-11-19",
    status: "shipped",
    title: "Foundation",
    summary: "The secure processing engine and the first tool.",
    highlights: [
      "Resumable chunked uploads with file-type checks and PDF bomb protection",
      "Sandboxed processing with live progress over Server-Sent Events",
      "AES-256 encryption at rest and automatic deletion",
      "Accounts with two-step verification and Google or GitHub sign-in",
    ],
    tools: ["merge"],
  },
  {
    version: "0.4.0",
    date: "Planned",
    status: "planned",
    title: "Conversion suite",
    summary: "Office, image, web and e-book conversions in both directions, plus OCR and PDF/A.",
    highlights: [
      "Word, Excel and PowerPoint to and from PDF",
      "OCR in 50+ languages",
      "PDF/A archiving",
    ],
    tools: [],
  },
  {
    version: "0.5.0",
    date: "Planned",
    status: "planned",
    title: "Editor and signing",
    summary: "A full in-browser editor, forms, signatures, redaction and comparison.",
    highlights: [
      "Edit text, images and shapes",
      "Visual and certificate signatures",
      "True content redaction",
    ],
    tools: [],
  },
];

export const SHIPPED_RELEASES = RELEASES.filter((release) => release.status === "shipped");

export const NEW_TOOL_SLUGS: ReadonlySet<string> = new Set(
  SHIPPED_RELEASES[0]?.tools.length
    ? SHIPPED_RELEASES[0].tools
    : SHIPPED_RELEASES.flatMap((release) => release.tools).slice(0, 4),
);
