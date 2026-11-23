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
    version: "0.7.0",
    date: "Next",
    status: "in-progress",
    title: "Hardening and validation",
    summary: "Independent validation of archival output and broader language coverage.",
    highlights: [
      "Validate PDF/A output with an independent checker",
      "Human-reviewed translations for more interface languages",
      "Live provider testing for Google Drive, Dropbox and OneDrive imports",
    ],
    tools: [],
  },
  {
    version: "0.6.0",
    date: "2026-11-23",
    status: "shipped",
    title: "Workspace and platform",
    summary: "Everything around the tools: files, teams, automation and a safer, deployable service.",
    highlights: [
      "My files with folders, tags, search and a 30-day trash",
      "Teams with roles, shared libraries and shared workflows",
      "Visual workflow builder, batch processing and scheduled workflows",
      "Webhooks, scoped API keys, a Python SDK with CLI and a JavaScript SDK",
      "Import from Google Drive, Dropbox and OneDrive",
      "Installable app, share target and an in-browser private mode",
      "Admin console with feature flags, announcements and report review",
      "Verified deletion, retention sweeps and account erasure",
      "Production Docker and VPS deployment with systemd units",
    ],
    tools: ["scan-to-pdf", "pdf-to-pdfa"],
  },
  {
    version: "0.5.0",
    date: "2026-11-21",
    status: "shipped",
    title: "Editor, signing and AI",
    summary: "Edit, sign, redact, compare and understand documents.",
    highlights: [
      "In-browser editor with text, images, shapes and find and replace",
      "Form builder, certificate signatures and signature verification",
      "E-sign requests with signer links and audit trails",
      "Redaction presets with a verification report, and visual comparison",
      "AI tools: summaries, smart split, rename, categorize and key dates",
    ],
    tools: ["edit-pdf", "digital-sign"],
  },
  {
    version: "0.4.0",
    date: "2026-11-20",
    status: "shipped",
    title: "Conversion suite",
    summary: "Office, image, web and spreadsheet conversions plus OCR and PDF/A.",
    highlights: [
      "Word, Excel and PowerPoint to and from PDF",
      "OCR in many languages including Urdu and Arabic",
      "PDF/A output, HTML and URL to PDF, scan to PDF",
      "Image tools including background removal",
    ],
    tools: [],
  },
  {
    version: "0.3.0",
    date: "2026-11-20",
    status: "shipped",
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
];

export const SHIPPED_RELEASES = RELEASES.filter((release) => release.status === "shipped");

export const NEW_TOOL_SLUGS: ReadonlySet<string> = new Set(
  SHIPPED_RELEASES[0]?.tools.length
    ? SHIPPED_RELEASES[0].tools
    : SHIPPED_RELEASES.flatMap((release) => release.tools).slice(0, 4),
);
