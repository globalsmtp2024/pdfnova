import { degrees, PDFDocument, PageSizes } from "pdf-lib";

import { parsePageExpression } from "@/lib/page-expression";

export class PrivateModeError extends Error {
  constructor(readonly code: "encrypted" | "unreadable" | "pages" | "image" | "empty") {
    super(code);
  }
}

export type PdfOutput = { name: string; bytes: Uint8Array };

export async function loadPdf(file: File): Promise<PDFDocument> {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await PDFDocument.load(data, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new PrivateModeError("encrypted");
    throw new PrivateModeError("unreadable");
  }
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "document";
}

function pagesOf(expression: string, count: number): number[] {
  const parsed = parsePageExpression(expression, count);
  if (!parsed.ok || !parsed.pages.length) throw new PrivateModeError("pages");
  return parsed.pages;
}

async function save(document: PDFDocument, name: string): Promise<PdfOutput> {
  return { name, bytes: await document.save({ useObjectStreams: true }) };
}

export async function mergePdfs(files: File[]): Promise<PdfOutput[]> {
  if (files.length < 2) throw new PrivateModeError("empty");
  const merged = await PDFDocument.create();
  for (const file of files) {
    const source = await loadPdf(file);
    const copied = await merged.copyPages(source, source.getPageIndices());
    for (const page of copied) merged.addPage(page);
  }
  return [await save(merged, "merged.pdf")];
}

export type SplitMode = "ranges" | "every" | "each";

export async function splitPdf(file: File, mode: SplitMode, value: string): Promise<PdfOutput[]> {
  const source = await loadPdf(file);
  const count = source.getPageCount();
  let groups: number[][];
  if (mode === "each") {
    groups = Array.from({ length: count }, (_, index) => [index]);
  } else if (mode === "every") {
    const size = Math.max(Number.parseInt(value, 10) || 0, 1);
    groups = [];
    for (let start = 0; start < count; start += size) {
      groups.push(Array.from({ length: Math.min(size, count - start) }, (_, offset) => start + offset));
    }
  } else {
    groups = value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => pagesOf(part, count));
  }
  if (!groups.length) throw new PrivateModeError("pages");
  const outputs: PdfOutput[] = [];
  for (const [index, group] of groups.entries()) {
    const part = await PDFDocument.create();
    for (const page of await part.copyPages(source, group)) part.addPage(page);
    outputs.push(await save(part, `${stem(file.name)}-part-${String(index + 1).padStart(2, "0")}.pdf`));
  }
  return outputs;
}

export async function rotatePdf(file: File, expression: string, angle: 90 | 180 | 270): Promise<PdfOutput[]> {
  const document = await loadPdf(file);
  const targets = pagesOf(expression, document.getPageCount());
  for (const index of new Set(targets)) {
    const page = document.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return [await save(document, `${stem(file.name)}-rotated.pdf`)];
}

export async function extractPages(file: File, expression: string): Promise<PdfOutput[]> {
  const source = await loadPdf(file);
  const targets = pagesOf(expression, source.getPageCount());
  const result = await PDFDocument.create();
  for (const page of await result.copyPages(source, targets)) result.addPage(page);
  return [await save(result, `${stem(file.name)}-extract.pdf`)];
}

export async function reorderPages(file: File, expression: string): Promise<PdfOutput[]> {
  const source = await loadPdf(file);
  const order = pagesOf(expression, source.getPageCount());
  const result = await PDFDocument.create();
  for (const page of await result.copyPages(source, order)) result.addPage(page);
  return [await save(result, `${stem(file.name)}-reordered.pdf`)];
}

export type ImagePageSize = "fit" | "a4" | "letter";

async function toPng(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PrivateModeError("image");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new PrivateModeError("image");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function imagesToPdf(
  files: File[],
  size: ImagePageSize,
  marginPoints: number,
): Promise<PdfOutput[]> {
  if (!files.length) throw new PrivateModeError("empty");
  const result = await PDFDocument.create();
  for (const file of files) {
    let image;
    try {
      const isJpeg = /jpe?g$/i.test(file.name) || file.type === "image/jpeg";
      const isPng = /png$/i.test(file.name) || file.type === "image/png";
      if (isJpeg) image = await result.embedJpg(new Uint8Array(await file.arrayBuffer()));
      else if (isPng) image = await result.embedPng(new Uint8Array(await file.arrayBuffer()));
      else image = await result.embedPng(await toPng(file));
    } catch {
      throw new PrivateModeError("image");
    }
    let width: number;
    let height: number;
    if (size === "fit") {
      width = image.width + 2 * marginPoints;
      height = image.height + 2 * marginPoints;
    } else {
      const [shortSide, longSide] = size === "a4" ? PageSizes.A4 : PageSizes.Letter;
      [width, height] = image.width > image.height ? [longSide, shortSide] : [shortSide, longSide];
    }
    const page = result.addPage([width, height]);
    const scale = Math.min((width - 2 * marginPoints) / image.width, (height - 2 * marginPoints) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, {
      x: (width - drawWidth) / 2,
      y: (height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }
  return [await save(result, "images.pdf")];
}

export type PdfMetadata = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
};

export async function readMetadata(file: File): Promise<PdfMetadata> {
  const document = await loadPdf(file);
  return {
    title: document.getTitle() ?? "",
    author: document.getAuthor() ?? "",
    subject: document.getSubject() ?? "",
    keywords: document.getKeywords() ?? "",
    creator: document.getCreator() ?? "",
    producer: document.getProducer() ?? "",
  };
}

export async function writeMetadata(file: File, metadata: PdfMetadata): Promise<PdfOutput[]> {
  const document = await loadPdf(file);
  document.setTitle(metadata.title);
  document.setAuthor(metadata.author);
  document.setSubject(metadata.subject);
  document.setKeywords(metadata.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean));
  document.setCreator(metadata.creator);
  document.setProducer(metadata.producer);
  return [await save(document, `${stem(file.name)}-metadata.pdf`)];
}
