export type PdfPreview = { dataUrl: string; pageCount: number };

const cache = new WeakMap<File, Promise<PdfPreview | null>>();

async function renderPdf(file: File, maxWidth: number): Promise<PdfPreview | null> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(maxWidth / unscaled.width, 2) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/png"), pageCount: document.numPages };
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

export function pdfPreview(file: File, maxWidth = 160): Promise<PdfPreview | null> {
  const existing = cache.get(file);
  if (existing) return existing;
  const created = renderPdf(file, maxWidth).catch(() => null);
  cache.set(file, created);
  return created;
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
