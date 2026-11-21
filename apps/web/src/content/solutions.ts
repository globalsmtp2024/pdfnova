import {
  Briefcase,
  Building2,
  Calculator,
  GraduationCap,
  House,
  School,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Solution = {
  slug: string;
  title: string;
  short: string;
  icon: LucideIcon;
  color: string;
  heroTitle: string;
  heroBody: string;
  pains: string[];
  tools: string[];
  workflow: string;
  faq: { question: string; answer: string }[];
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "students",
    title: "Students",
    short: "Assignments, notes and applications without the formatting fights.",
    icon: GraduationCap,
    color: "#5B4BFF",
    heroTitle: "Hand in clean documents, every time",
    heroBody:
      "Combine lecture notes, shrink scanned handouts below upload limits and turn photos of whiteboards into readable PDFs, all for free.",
    pains: [
      "Learning portals reject files above a size limit",
      "Assignments need several documents combined in a set order",
      "Phone photos of notes are hard to read and search",
    ],
    tools: ["merge", "compress", "image-to-pdf", "ocr", "pdf-to-word", "page-numbers"],
    workflow: "scan-ocr-compress",
    faq: [
      {
        question: "Can I merge files from different subjects into one PDF?",
        answer:
          "Yes. Merge PDF keeps the order you choose and can add a bookmark for each file so markers can jump between sections.",
      },
      {
        question: "My portal only accepts files under 10 MB. What can I do?",
        answer:
          "Compress PDF re-encodes images and packs the document structure. Scans usually shrink the most.",
      },
      {
        question: "Do I need to sign up?",
        answer:
          "No. Every tool works without an account. An account only adds history and longer file retention.",
      },
    ],
  },
  {
    slug: "freelancers",
    title: "Freelancers",
    short: "Proposals, contracts and invoices that look like a studio sent them.",
    icon: Briefcase,
    color: "#12B5A6",
    heroTitle: "Look polished with every client",
    heroBody:
      "Assemble proposals from several files, protect contracts with a password, sign agreements and keep invoices tidy, without paying for desktop software.",
    pains: [
      "Proposals are spread across slides, documents and portfolios",
      "Contracts need signatures and protection before sending",
      "Invoices pile up in mixed formats",
    ],
    tools: ["merge", "sign", "protect", "watermark", "compress", "pdf-to-word"],
    workflow: "contract-prep",
    faq: [
      {
        question: "Can I protect a contract before emailing it?",
        answer: "Protect PDF adds AES-256 encryption and lets you restrict printing or copying.",
      },
      {
        question: "Will clients see a watermark from you?",
        answer:
          "Never. Outputs carry no branding from us. Only watermarks you add yourself appear.",
      },
      {
        question: "Can I automate repetitive steps?",
        answer:
          "Workflows chain tools into one run. The builder arrives in a later release, and the API is available today.",
      },
    ],
  },
  {
    slug: "small-business",
    title: "Small business",
    short: "Quotes, receipts and paperwork handled in minutes.",
    icon: Building2,
    color: "#F97316",
    heroTitle: "Less paperwork, more business",
    heroBody:
      "Convert quotes to PDF, compress receipts for accounting software, combine monthly statements and keep sensitive files protected.",
    pains: [
      "Receipts arrive as photos, scans and email attachments",
      "Accounting tools have upload limits",
      "Sensitive files are shared too freely",
    ],
    tools: ["image-to-pdf", "compress", "merge", "protect", "excel-to-pdf", "pdf-to-excel"],
    workflow: "invoice-cleanup",
    faq: [
      {
        question: "Can several people on my team use it?",
        answer:
          "Yes, and it is free for everyone. Each person can use it with or without an account.",
      },
      {
        question: "Is my financial data safe?",
        answer:
          "Files are encrypted at rest, processed in isolated sandboxes and deleted automatically after one hour.",
      },
      {
        question: "Can I connect it to my own systems?",
        answer: "Create a free API key in your dashboard and call the REST API from your scripts.",
      },
    ],
  },
  {
    slug: "legal",
    title: "Legal",
    short: "Bundles, exhibits and redactions with care for confidentiality.",
    icon: Scale,
    color: "#10B981",
    heroTitle: "Court-ready bundles without the overtime",
    heroBody:
      "Merge exhibits in order with bookmarks, add page numbers and Bates stamps, compare drafts and permanently redact sensitive details.",
    pains: [
      "Bundles must follow a strict order and numbering",
      "Redactions must remove text, not just cover it",
      "Drafts change between rounds of review",
    ],
    tools: ["merge", "page-numbers", "bates-numbering", "redact", "compare", "protect"],
    workflow: "contract-prep",
    faq: [
      {
        question: "Are redactions permanent?",
        answer:
          "Redact PDF is designed to remove the underlying content, not draw boxes over it. It ships with the editor release.",
      },
      {
        question: "Can bookmarks follow the exhibit order?",
        answer:
          "Merge PDF can add a bookmark per file and keep each file's own outline nested underneath.",
      },
      {
        question: "Who can see our documents?",
        answer:
          "No one. Processing is automated in isolated sandboxes, and contents never reach logs.",
      },
    ],
  },
  {
    slug: "hr-recruiting",
    title: "HR and recruiting",
    short: "Candidate packs, contracts and onboarding files, organized.",
    icon: Users,
    color: "#EC4899",
    heroTitle: "Hiring paperwork, sorted",
    heroBody:
      "Bundle CVs and cover letters per candidate, convert offer letters to PDF, protect personal data and clean metadata before sharing.",
    pains: [
      "Applications arrive in every possible format",
      "Personal data needs careful handling",
      "Onboarding packs mix many documents",
    ],
    tools: ["merge", "word-to-pdf", "protect", "remove-metadata", "sign", "ai-extract-data"],
    workflow: "candidate-pack",
    faq: [
      {
        question: "Can I remove hidden metadata before sharing CVs?",
        answer:
          "Remove metadata strips author, software and history fields. It ships with the core tools release.",
      },
      {
        question: "How long are candidate files kept?",
        answer:
          "One hour by default, or 24 hours if you choose it in your settings. You can delete instantly at any time.",
      },
      {
        question: "Is it suitable for personal data?",
        answer:
          "Files are encrypted at rest and deleted automatically. Review your own obligations, and see our privacy policy.",
      },
    ],
  },
  {
    slug: "finance-accounting",
    title: "Finance and accounting",
    short: "Statements, tables and reports in the format you need.",
    icon: Calculator,
    color: "#2F80ED",
    heroTitle: "From PDF statements to spreadsheets",
    heroBody:
      "Pull tables out of PDF statements into Excel or CSV, merge month-end reports, add page numbers and archive to PDF/A.",
    pains: [
      "Statements only arrive as PDFs",
      "Month-end packs need consistent numbering",
      "Records must be archived reliably",
    ],
    tools: ["pdf-to-excel", "pdf-to-csv", "merge", "page-numbers", "pdf-to-pdfa", "compress"],
    workflow: "month-end-pack",
    faq: [
      {
        question: "How accurate is table extraction?",
        answer:
          "PDF to Excel detects table structure in digital PDFs. Scanned statements need OCR first.",
      },
      {
        question: "Can I archive to PDF/A?",
        answer: "PDF to PDF/A ships with the conversion suite and supports PDF/A-1b, 2b and 3b.",
      },
      {
        question: "Is there a limit on statements per month?",
        answer: "Only fair-use limits that ordinary month-end work does not reach.",
      },
    ],
  },
  {
    slug: "real-estate",
    title: "Real estate",
    short: "Listings, disclosures and signed agreements in one place.",
    icon: House,
    color: "#F59E0B",
    heroTitle: "Close deals with tidy paperwork",
    heroBody:
      "Turn property photos into brochures, combine disclosures, collect signatures and compress large packs for email.",
    pains: [
      "Property packs are huge and bounce from inboxes",
      "Agreements need signatures from several people",
      "Photos need to become shareable documents",
    ],
    tools: ["image-to-pdf", "merge", "compress", "sign", "watermark", "protect"],
    workflow: "listing-pack",
    faq: [
      {
        question: "Can I watermark brochures?",
        answer: "Watermark adds text or a logo with your chosen opacity and placement.",
      },
      {
        question: "Can clients sign online?",
        answer:
          "Sign PDF lets you draw, type or upload a signature. Signature requests to other people arrive in a later release.",
      },
      {
        question: "Will large photo packs upload reliably?",
        answer: "Uploads are resumable, so a weak connection doesn't restart a large upload.",
      },
    ],
  },
  {
    slug: "education",
    title: "Education institutions",
    short: "Course packs, forms and accessible documents at scale.",
    icon: School,
    color: "#8B5CF6",
    heroTitle: "Course materials for every learner",
    heroBody:
      "Assemble course packs, make scanned readings searchable, create fillable forms and keep everything accessible, at no cost to the school.",
    pains: [
      "Readings arrive as unsearchable scans",
      "Forms are printed, filled and scanned again",
      "Budgets for software are tight",
    ],
    tools: ["merge", "ocr", "create-forms", "fill-forms", "compress", "ai-summarize"],
    workflow: "scan-ocr-compress",
    faq: [
      {
        question: "Is it free for schools?",
        answer:
          "Yes. Every tool is free for everyone, including institutions. Fair-use limits apply per person.",
      },
      {
        question: "Can we integrate it with our systems?",
        answer:
          "Staff can create free API keys and call the REST API from scripts or learning platforms.",
      },
      {
        question: "Does it support right-to-left languages?",
        answer:
          "The interface supports Urdu with a right-to-left layout, and more languages are planned.",
      },
    ],
  },
];

export function findSolution(slug: string): Solution | undefined {
  return SOLUTIONS.find((solution) => solution.slug === slug);
}
