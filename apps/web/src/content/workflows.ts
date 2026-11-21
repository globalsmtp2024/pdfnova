export type WorkflowRecipe = {
  slug: string;
  title: string;
  description: string;
  steps: { tool: string; note: string }[];
  audience: string[];
};

export const WORKFLOWS: WorkflowRecipe[] = [
  {
    slug: "scan-ocr-compress",
    title: "Scan, OCR, compress",
    description: "Turn phone photos into a small, searchable PDF ready to upload anywhere.",
    steps: [
      { tool: "image-to-pdf", note: "Combine page photos into one PDF" },
      { tool: "ocr", note: "Add a searchable text layer" },
      { tool: "compress", note: "Shrink for upload limits" },
    ],
    audience: ["students", "education"],
  },
  {
    slug: "invoice-cleanup",
    title: "Invoice cleanup",
    description: "Normalize a month of receipts and invoices into one tidy, numbered file.",
    steps: [
      { tool: "image-to-pdf", note: "Convert receipt photos" },
      { tool: "merge", note: "Combine with PDF invoices" },
      { tool: "page-numbers", note: "Number every page" },
      { tool: "compress", note: "Make it email friendly" },
    ],
    audience: ["small-business", "finance-accounting"],
  },
  {
    slug: "contract-prep",
    title: "Contract prep",
    description: "Assemble, number, sign and protect an agreement before it goes out.",
    steps: [
      { tool: "merge", note: "Contract plus schedules" },
      { tool: "page-numbers", note: "Consistent numbering" },
      { tool: "sign", note: "Add your signature" },
      { tool: "protect", note: "Encrypt before sending" },
    ],
    audience: ["freelancers", "legal"],
  },
  {
    slug: "candidate-pack",
    title: "Candidate pack",
    description: "One clean, private file per applicant.",
    steps: [
      { tool: "word-to-pdf", note: "Convert CVs and letters" },
      { tool: "merge", note: "Combine per candidate" },
      { tool: "remove-metadata", note: "Strip hidden data" },
    ],
    audience: ["hr-recruiting"],
  },
  {
    slug: "month-end-pack",
    title: "Month-end pack",
    description: "Statements, tables and reports archived the right way.",
    steps: [
      { tool: "pdf-to-excel", note: "Extract statement tables" },
      { tool: "merge", note: "Assemble the pack" },
      { tool: "pdf-to-pdfa", note: "Archive as PDF/A" },
    ],
    audience: ["finance-accounting"],
  },
  {
    slug: "listing-pack",
    title: "Listing pack",
    description: "From property photos to a branded, shareable brochure.",
    steps: [
      { tool: "image-to-pdf", note: "Photos to pages" },
      { tool: "watermark", note: "Add your agency mark" },
      { tool: "compress", note: "Small enough for email" },
    ],
    audience: ["real-estate"],
  },
];

export function findWorkflow(slug: string): WorkflowRecipe | undefined {
  return WORKFLOWS.find((workflow) => workflow.slug === slug);
}
