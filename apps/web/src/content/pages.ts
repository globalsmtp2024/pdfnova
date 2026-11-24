import {
  Accessibility,
  Bot,
  Clock,
  Code2,
  Cpu,
  EyeOff,
  FileSearch,
  Gift,
  Globe,
  HardDrive,
  KeyRound,
  Languages,
  Layers,
  Lock,
  ScrollText,
  ShieldCheck,
  Timer,
  Trash2,
  WifiOff,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { ToolCategoryId } from "@/config/tools";

import {
  ACCESSIBILITY_COMMITMENTS_UR,
  CATEGORY_FAQ_UR,
  COMPARE_ROWS_UR,
  FEATURES_UR,
  HELP_UR,
  LIFECYCLE_TIMES_UR,
  LIFECYCLE_UR,
  PRINCIPLES_UR,
  PROTECTIONS_UR,
} from "./pages.ur";

export type Capability = {
  icon: LucideIcon;
  title: string;
  body: string;
  color: string;
  status: "available" | "later";
  wide?: boolean;
};

export const FEATURES: Capability[] = [
  {
    icon: Gift,
    title: "Free for everyone",
    body: "Every tool and every feature, with no plans, no paywalls and no watermarks. Fair-use limits only exist to keep the service fast for all.",
    color: "#5B4BFF",
    status: "available",
    wide: true,
  },
  {
    icon: Zap,
    title: "Speed",
    body: "Resumable chunked uploads, workers that process jobs as soon as they arrive and live progress streamed to your browser.",
    color: "#F59E0B",
    status: "available",
  },
  {
    icon: ShieldCheck,
    title: "Privacy",
    body: "AES-256 encryption at rest, isolated processing for every job and automatic deletion after one hour.",
    color: "#10B981",
    status: "available",
  },
  {
    icon: Layers,
    title: "Batch processing",
    body: "Up to 100 files per task with per-file status and a single ZIP to download.",
    color: "#12B5A6",
    status: "available",
  },
  {
    icon: Code2,
    title: "REST API",
    body: "Free API keys, resumable uploads, Server-Sent Events for progress and signed download links.",
    color: "#2F80ED",
    status: "available",
  },
  {
    icon: Accessibility,
    title: "Accessibility",
    body: "Keyboard navigation everywhere, visible focus, screen reader labels and contrast that meets WCAG 2.2 AA.",
    color: "#EC4899",
    status: "available",
  },
  {
    icon: Languages,
    title: "Languages",
    body: "English and Urdu today, with a right-to-left layout that mirrors the whole interface.",
    color: "#8B5CF6",
    status: "available",
  },
  {
    icon: Workflow,
    title: "Workflows",
    body: "Chain tools like OCR, compress and protect into a reusable pipeline you can run on many files.",
    color: "#F97316",
    status: "available",
  },
  {
    icon: WifiOff,
    title: "On-device private mode",
    body: "Merge, split, rotate and image to PDF directly in your browser, so files never leave your device.",
    color: "#0EA5E9",
    status: "available",
  },
  {
    icon: Bot,
    title: "AI assistance",
    body: "Summaries, translation, chat with citations and data extraction, with your own provider key if you prefer.",
    color: "#A855F7",
    status: "available",
  },
];

export const PROTECTIONS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    body: "Production traffic is served over HTTPS. Stored files are encrypted with AES-256-GCM on local storage, or with server-side AES-256 when stored in S3-compatible object storage.",
  },
  {
    icon: Cpu,
    title: "Isolated processing",
    body: "Every job runs in its own operating system process with time, memory and output-size limits, inside a private working directory that is removed afterwards.",
  },
  {
    icon: Trash2,
    title: "Automatic deletion",
    body: "Files are deleted one hour after processing, or after 24 hours if you are signed in and choose that. A retention sweeper runs continuously, and Delete now removes files immediately.",
  },
  {
    icon: EyeOff,
    title: "No contents in logs",
    body: "Logs record technical events such as timings and error types. File contents never reach logs, and sensitive fields like passwords and tokens are redacted automatically.",
  },
  {
    icon: KeyRound,
    title: "Signed, expiring links",
    body: "Download links are signed with a server secret and expire after 15 minutes. They only work for files that still exist.",
  },
  {
    icon: FileSearch,
    title: "Hostile file checks",
    body: "Uploads are identified by their content, not their name. Archive bombs and PDF decompression bombs are rejected before processing.",
  },
  {
    icon: Globe,
    title: "Safe link imports",
    body: "Importing a file from a link only reaches public internet addresses. Private, loopback and cloud metadata addresses are blocked, including after redirects.",
  },
  {
    icon: ShieldCheck,
    title: "Account security",
    body: "Passwords are hashed with Argon2id. Sessions rotate refresh tokens and detect reuse. Two-step verification with recovery codes is available to everyone.",
  },
];

export const LIFECYCLE: { icon: LucideIcon; title: string; body: string; time: string }[] = [
  {
    icon: Lock,
    title: "Upload",
    body: "Your file streams to us in encrypted chunks and is stored encrypted.",
    time: "0:00",
  },
  {
    icon: FileSearch,
    title: "Inspect",
    body: "We identify the real file type and reject anything unsafe.",
    time: "+ seconds",
  },
  {
    icon: Cpu,
    title: "Process",
    body: "An isolated worker runs the tool with strict limits and reports progress live.",
    time: "≤ 5 min",
  },
  {
    icon: Timer,
    title: "Download",
    body: "You get a signed link that expires in 15 minutes.",
    time: "+ 15 min",
  },
  {
    icon: Trash2,
    title: "Delete",
    body: "Inputs and outputs are deleted automatically, or instantly when you choose.",
    time: "1 h",
  },
];

export const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Gift,
    title: "Free means free",
    body: "No trials, no plans and no watermarks. Limits exist only to keep the service fast for everyone, and they are published openly.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy first",
    body: "We keep files for the shortest useful time and never look at them. Accounts are optional.",
  },
  {
    icon: Clock,
    title: "Respect people’s time",
    body: "Two clicks from file to result, honest progress and plain-language errors that explain how to fix things.",
  },
  {
    icon: HardDrive,
    title: "Honest engineering",
    body: "We only describe what is built. Unfinished tools are clearly marked and never pretend to work.",
  },
];

export const COMPARE_ROWS: { feature: string; value: string; note?: string }[] = [
  { feature: "Price", value: "Free for everyone", note: "No paid plans, trials or watermarks" },
  { feature: "Account required", value: "No", note: "Optional, adds history and API keys" },
  { feature: "File size", value: "Up to 200 MB per file" },
  { feature: "Files per task", value: "Up to 100" },
  { feature: "Automatic deletion", value: "1 hour, or 24 hours if you choose" },
  { feature: "Delete instantly", value: "Yes" },
  { feature: "Encryption at rest", value: "AES-256" },
  { feature: "Resumable uploads", value: "Yes" },
  { feature: "Live progress", value: "Yes, streamed over Server-Sent Events" },
  { feature: "REST API", value: "Yes, with free API keys" },
  { feature: "Bring your own AI key", value: "Yes" },
  { feature: "Two-step verification", value: "Yes, with recovery codes" },
  { feature: "Languages", value: "English and Urdu with right-to-left layout" },
  {
    feature: "Tools available today",
    value: "See the live list",
    note: "Tools not built yet are marked Coming soon",
  },
];

export const ACCESSIBILITY_COMMITMENTS = [
  "Every interactive element can be reached and operated with a keyboard, with a visible focus outline.",
  "Text and interface colors are chosen to meet WCAG 2.2 AA contrast in both light and dark themes.",
  "Images that carry meaning have text alternatives, and decorative graphics are hidden from screen readers.",
  "Motion respects your system’s reduced-motion setting.",
  "Pages use semantic headings, landmarks and labels so screen readers can navigate them.",
  "The interface supports right-to-left languages, starting with Urdu.",
];

export type HelpTopic = {
  id: string;
  title: string;
  icon: LucideIcon;
  items: { question: string; answer: string }[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: Zap,
    items: [
      {
        question: "Do I need to create an account?",
        answer:
          "No. Every tool works without an account. An account adds history, API keys, longer retention and access from any device.",
      },
      {
        question: "Which browsers are supported?",
        answer: "Current versions of Chrome, Edge, Firefox and Safari on desktop and mobile.",
      },
      {
        question: "How do I find a tool quickly?",
        answer:
          "Press Ctrl+K (or Cmd+K on a Mac) anywhere to open the command palette and type what you want to do.",
      },
    ],
  },
  {
    id: "files",
    title: "Files and uploads",
    icon: HardDrive,
    items: [
      {
        question: "What is the maximum file size?",
        answer: "Up to 200 MB per file and 100 files per task.",
      },
      {
        question: "My upload stopped. Do I need to start again?",
        answer:
          "No. Uploads are resumable and continue from where they stopped when your connection returns.",
      },
      {
        question: "Can I import a file from a link?",
        answer:
          "Yes. Use Import from a link on a tool page. Only public http and https links can be imported.",
      },
      {
        question: "Why was my file rejected?",
        answer:
          "We check the real file type, not the extension. Damaged files, password-protected PDFs for tools that cannot open them and unsafe archives are rejected with an explanation.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and security",
    icon: ShieldCheck,
    items: [
      {
        question: "How long do you keep my files?",
        answer:
          "One hour after processing by default, or 24 hours if you are signed in and choose that in Settings. Delete now removes them instantly.",
      },
      {
        question: "Can anyone see my documents?",
        answer:
          "No. Processing is automated in isolated sandboxes, and file contents never reach our logs.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Go to Settings, then Your data, and choose Delete account. Your account, keys and stored files are deleted.",
      },
    ],
  },
  {
    id: "limits",
    title: "Fair use",
    icon: Timer,
    items: [
      {
        question: "Why did I see a fair-use limit?",
        answer:
          "Hourly and daily task caps protect the servers from abuse. The message shows the exact time you can continue. Normal use never reaches them.",
      },
      {
        question: "Is there a limit on AI features?",
        answer:
          "The shared AI allowance has a daily cap. Adding your own provider key in Settings removes it.",
      },
      {
        question: "Will the limits ever turn into paid plans?",
        answer:
          "No. The product is free for everyone. Limits only exist to keep the service fast and available.",
      },
    ],
  },
  {
    id: "api",
    title: "API and developers",
    icon: Code2,
    items: [
      {
        question: "How do I get an API key?",
        answer: "Sign in, open your dashboard and create a key under API keys. Keys are free.",
      },
      {
        question: "Are there API rate limits?",
        answer:
          "Yes, the same fair-use limits apply, plus a per-minute request limit. Responses include Retry-After when a limit is reached.",
      },
      {
        question: "Is there an OpenAPI specification?",
        answer:
          "Yes. The interactive reference is available at /docs and the raw specification at /openapi.json.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: ScrollText,
    items: [
      {
        question: "How do I turn on two-step verification?",
        answer:
          "Open Settings, then Security, and choose Turn on. Scan the key with an authenticator app and store your recovery codes.",
      },
      {
        question: "Can I sign out of other devices?",
        answer: "Yes. Settings lists your active sessions and lets you sign any of them out.",
      },
      {
        question: "Can I export my data?",
        answer:
          "Yes. Settings, Your data, Download my data gives you a JSON file with your account and task history.",
      },
    ],
  },
];

export const CATEGORY_FAQ: Record<ToolCategoryId, { question: string; answer: string }[]> = {
  organize: [
    {
      question: "Does organizing pages reduce quality?",
      answer:
        "No. Merge PDF copies pages as they are, without re-rendering them, so text stays sharp and searchable.",
    },
    {
      question: "Can I organize password-protected PDFs?",
      answer:
        "Protected PDFs are detected on upload. Unlock PDF removes the password first when you know it.",
    },
  ],
  optimize: [
    {
      question: "Are the optimization tools available?",
      answer:
        "Compress, repair, flatten, OCR and PDF/A are available. PDF/A output is produced with an embedded color profile but has not yet been checked by an independent validator.",
    },
    {
      question: "Will OCR support my language?",
      answer:
        "OCR runs on the Tesseract engine installed on our servers and supports many languages, including Urdu and Arabic.",
    },
  ],
  convert_to_pdf: [
    {
      question: "Can I convert files to PDF?",
      answer:
        "Yes. Office documents, images, web pages, ebooks and scans convert to PDF. A tool is marked Coming soon only if it is not built yet.",
    },
    {
      question: "Can I convert many files at once?",
      answer: "Yes. Every tool can accept up to 100 files per task, downloaded together as a ZIP.",
    },
  ],
  convert_from_pdf: [
    {
      question: "Which formats can I convert a PDF to?",
      answer:
        "Word, Excel, PowerPoint, images, EPUB, text and more. Each tool page says what the output contains.",
    },
    {
      question: "Do scanned PDFs work?",
      answer:
        "Yes. The OCR versions of the conversion tools read scanned pages first, using the languages installed on the server.",
    },
  ],
  edit: [
    {
      question: "Do edits change my original file?",
      answer: "Never. Every tool produces a new file and your original stays untouched.",
    },
    {
      question: "Can I edit only some pages?",
      answer: "Tools that work on pages accept ranges like 1-3, 7 or 10-last.",
    },
  ],
  security: [
    {
      question: "Do you store my passwords?",
      answer: "No. Passwords are used for the task only and are never stored or logged.",
    },
    {
      question: "Is redaction permanent?",
      answer: "Yes. Redaction removes the underlying content, not just draws boxes over it.",
    },
  ],
  ai: [
    {
      question: "Which AI provider is used?",
      answer:
        "A provider-agnostic layer. Save your own key, or any OpenAI-compatible server, in Settings.",
    },
    {
      question: "Is there a limit on AI requests?",
      answer: "The shared allowance has a daily fair-use cap. Your own key removes it.",
    },
  ],
  image: [
    {
      question: "Which image formats are supported?",
      answer: "JPG, PNG, WebP, TIFF, BMP, GIF and HEIC.",
    },
    {
      question: "Are the image tools available?",
      answer: "Yes. They are listed on the tools page.",
    },
  ],
};

export function localizedFeatures(locale: string): Capability[] {
  if (locale !== "ur") return FEATURES;
  return FEATURES.map((item, index) => ({ ...item, ...FEATURES_UR[index] }));
}

export function localizedProtections(locale: string) {
  if (locale !== "ur") return PROTECTIONS;
  return PROTECTIONS.map((item, index) => ({ ...item, ...PROTECTIONS_UR[index] }));
}

export function localizedLifecycle(locale: string) {
  if (locale !== "ur") return LIFECYCLE;
  return LIFECYCLE.map((item, index) => ({
    ...item,
    ...LIFECYCLE_UR[index],
    time: LIFECYCLE_TIMES_UR[index] ?? item.time,
  }));
}

export function localizedPrinciples(locale: string) {
  if (locale !== "ur") return PRINCIPLES;
  return PRINCIPLES.map((item, index) => ({ ...item, ...PRINCIPLES_UR[index] }));
}

export function localizedCompareRows(locale: string) {
  return locale === "ur" ? COMPARE_ROWS_UR : COMPARE_ROWS;
}

export function localizedCommitments(locale: string) {
  return locale === "ur" ? ACCESSIBILITY_COMMITMENTS_UR : ACCESSIBILITY_COMMITMENTS;
}

export function localizedHelpTopics(locale: string): HelpTopic[] {
  if (locale !== "ur") return HELP_TOPICS;
  return HELP_TOPICS.map((topic) => ({ ...topic, ...HELP_UR[topic.id] }));
}

export function localizedCategoryFaq(locale: string, category: ToolCategoryId) {
  if (locale === "ur") return CATEGORY_FAQ_UR[category] ?? CATEGORY_FAQ[category];
  return CATEGORY_FAQ[category];
}
