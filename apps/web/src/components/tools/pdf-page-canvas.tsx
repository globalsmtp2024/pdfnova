"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { LocalFile } from "@/components/tools/use-tool-session";

export type PageView = {
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
  scale: number;
};

export type PdfDocumentHandle = { numPages: number; getPage: (index: number) => Promise<unknown>; destroy: () => void };

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
};

const MAX_DISPLAY_WIDTH = 880;

export function usePdfDocument(file: LocalFile | undefined) {
  const [document, setDocument] = useState<PdfDocumentHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const source = file?.file ?? null;
  const password = file?.password ?? "";

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let task: { destroy: () => Promise<void>; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = new Uint8Array(await source.arrayBuffer());
        task = pdfjs.getDocument({ data, password: password || undefined });
        const loaded = (await task.promise) as unknown as PdfDocumentHandle;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setFailed(false);
        setDocument(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      setDocument(null);
      void task?.destroy();
    };
  }, [source, password]);

  return { document, failed };
}

export function PdfPageCanvas({
  document,
  pageIndex,
  children,
  onView,
}: {
  document: PdfDocumentHandle | null;
  pageIndex: number;
  children?: (view: PageView) => ReactNode;
  onView?: (view: PageView) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(MAX_DISPLAY_WIDTH);
  const [view, setView] = useState<PageView | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current || available <= 0) return;
    let cancelled = false;
    (async () => {
      const page = (await document.getPage(pageIndex + 1)) as PdfPage;
      const base = page.getViewport({ scale: 1 });
      const width = Math.min(available, MAX_DISPLAY_WIDTH);
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const target = canvas.current;
      if (!target || cancelled) return;
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      const context = target.getContext("2d");
      if (!context) return;
      await page.render({ canvas: target, canvasContext: context, viewport }).promise;
      if (cancelled) return;
      const next: PageView = {
        width,
        height: (base.height / base.width) * width,
        widthPt: base.width,
        heightPt: base.height,
        scale: width / base.width,
      };
      setView(next);
      onView?.(next);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [document, pageIndex, available, onView]);

  return (
    <div ref={wrapper} className="flex w-full justify-center">
      <div
        className="relative bg-white shadow-sm"
        style={view ? { width: view.width, height: view.height } : { width: "100%", minHeight: 320 }}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
        {view && children ? children(view) : null}
      </div>
    </div>
  );
}
