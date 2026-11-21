const ACCEPT_BY_KIND: Record<string, string[]> = {
  pdf: [".pdf", "application/pdf"],
  image: ["image/*", ".heic", ".heif"],
  docx: [".docx"],
  doc: [".doc"],
  xlsx: [".xlsx"],
  xls: [".xls"],
  pptx: [".pptx"],
  ppt: [".ppt"],
  odt: [".odt"],
  ods: [".ods"],
  odp: [".odp"],
  rtf: [".rtf"],
  epub: [".epub"],
  html: [".html", ".htm"],
  markdown: [".md", ".markdown"],
  text: [".txt"],
  csv: [".csv"],
};

export function acceptForKinds(kinds: string[]): string[] {
  return kinds.flatMap((kind) => ACCEPT_BY_KIND[kind] ?? []);
}

export function describeKinds(kinds: string[]): string {
  const labels = kinds.map((kind) =>
    kind === "pdf" ? "PDF" : kind === "image" ? "images" : kind.toUpperCase(),
  );
  if (labels.length <= 1) return labels[0] ?? "files";
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}
