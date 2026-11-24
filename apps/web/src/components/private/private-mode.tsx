"use client";

import { Download, FileDown, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dropzone, partitionFiles } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  extractPages,
  imagesToPdf,
  mergePdfs,
  PrivateModeError,
  readMetadata,
  reorderPages,
  rotatePdf,
  splitPdf,
  writeMetadata,
  type ImagePageSize,
  type PdfMetadata,
  type PdfOutput,
  type SplitMode,
} from "@/lib/private-pdf";
import { cn, formatBytes } from "@/lib/utils";

type Operation = "merge" | "split" | "rotate" | "extract" | "reorder" | "images" | "metadata";
const OPERATIONS: Operation[] = [
  "merge",
  "split",
  "rotate",
  "extract",
  "reorder",
  "images",
  "metadata",
];
const MAX_BYTES = 200 * 1024 * 1024;
const EMPTY_METADATA: PdfMetadata = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
};

type Result = PdfOutput & { url: string };

export function PrivateMode() {
  const t = useTranslations("privateMode");
  const [operation, setOperation] = useState<Operation>("merge");
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [splitValue, setSplitValue] = useState("1-2;3-4");
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [pageSize, setPageSize] = useState<ImagePageSize>("a4");
  const [margin, setMargin] = useState(20);
  const [metadata, setMetadata] = useState<PdfMetadata>(EMPTY_METADATA);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);

  const accept = operation === "images" ? ["image/*", ".heic"] : [".pdf", "application/pdf"];
  const single = operation !== "merge" && operation !== "images";

  const clearResults = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setResults([]);
  };

  const choose = (next: Operation) => {
    setOperation(next);
    setFiles([]);
    setError(null);
    clearResults();
  };

  const addFiles = async (incoming: File[]) => {
    const { accepted, rejected } = partitionFiles(incoming, accept, MAX_BYTES);
    if (rejected.length) toast.error(t("rejected"));
    const next = single ? accepted.slice(0, 1) : [...files, ...accepted];
    setFiles(next);
    clearResults();
    setError(null);
    if (operation === "metadata" && next[0]) {
      try {
        setMetadata(await readMetadata(next[0]));
      } catch (caught) {
        setError(messageFor(caught));
      }
    }
  };

  const messageFor = (caught: unknown): string =>
    caught instanceof PrivateModeError ? t(`errors.${caught.code}`) : t("errors.unreadable");

  const run = async () => {
    setBusy(true);
    setError(null);
    clearResults();
    try {
      let outputs: PdfOutput[];
      const [first] = files;
      if (operation === "merge") outputs = await mergePdfs(files);
      else if (operation === "images") outputs = await imagesToPdf(files, pageSize, margin);
      else if (operation === "split") outputs = await splitPdf(first, splitMode, splitValue);
      else if (operation === "rotate") outputs = await rotatePdf(first, pages, angle);
      else if (operation === "extract") outputs = await extractPages(first, pages);
      else if (operation === "reorder") outputs = await reorderPages(first, pages);
      else outputs = await writeMetadata(first, metadata);
      const made = outputs.map((output) => {
        const url = URL.createObjectURL(
          new Blob([output.bytes as BlobPart], { type: "application/pdf" }),
        );
        urls.current.push(url);
        return { ...output, url };
      });
      setResults(made);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    const { zipSync } = await import("fflate");
    const entries: Record<string, Uint8Array> = {};
    for (const result of results) entries[result.name] = result.bytes;
    const blob = new Blob([zipSync(entries, { level: 0 }) as BlobPart], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pdfnova-private.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const needsPages = operation === "rotate" || operation === "extract" || operation === "reorder";
  const ready =
    files.length > 0 &&
    (operation !== "merge" || files.length >= 2) &&
    !busy &&
    (operation !== "split" || splitValue.trim() !== "");

  return (
    <div className="flex flex-col gap-6" data-private-mode>
      <p className="flex items-start gap-2 rounded-xl border border-success/40 bg-success-subtle p-3 text-sm text-success-strong">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("promise")}
      </p>

      <div role="tablist" aria-label={t("operations")} className="flex flex-wrap gap-2">
        {OPERATIONS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={operation === entry}
            data-private-op={entry}
            onClick={() => choose(entry)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              operation === entry
                ? "border-primary bg-primary-subtle text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            {t(`op.${entry}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex flex-col gap-4">
          <Dropzone
            accept={accept}
            maxSizeBytes={MAX_BYTES}
            multiple={!single}
            title={operation === "images" ? t("dropImages") : t("dropPdfs")}
            subtitle={t("dropHint")}
            size="compact"
            onFiles={(incoming) => void addFiles(incoming)}
          />
          {files.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface text-sm">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 p-2"
                >
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="text-sm text-danger-strong" role="alert" data-private-error>
              {error}
            </p>
          ) : null}
          {results.length ? (
            <div
              className="flex flex-col gap-2 rounded-(--radius-card) border border-border bg-surface p-4"
              data-private-results
            >
              <h2 className="font-display text-lg font-semibold">{t("done")}</h2>
              {results.map((result) => (
                <a
                  key={result.name}
                  href={result.url}
                  download={result.name}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Download className="size-4 text-primary" aria-hidden />
                    {result.name}
                  </span>
                  <span className="text-xs text-muted">{formatBytes(result.bytes.byteLength)}</span>
                </a>
              ))}
              {results.length > 1 ? (
                <Button type="button" variant="outline" onClick={() => void downloadZip()}>
                  <FileDown aria-hidden />
                  {t("downloadZip")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-lifted lg:self-start">
          <h2 className="font-display text-lg font-semibold">{t(`op.${operation}`)}</h2>
          <p className="text-xs text-muted">{t(`help.${operation}`)}</p>
          {needsPages ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {operation === "reorder" ? t("newOrder") : t("pages")}
              <Input
                value={pages}
                onChange={(event) => setPages(event.target.value)}
                placeholder={operation === "reorder" ? "3,1,2" : "1-3, 5, last"}
                dir="ltr"
                data-private-pages
              />
            </label>
          ) : null}
          {operation === "rotate" ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("angle")}
              <select
                value={angle}
                onChange={(event) => setAngle(Number(event.target.value) as 90 | 180 | 270)}
                className="h-10 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
              >
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </label>
          ) : null}
          {operation === "split" ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("splitBy")}
                <select
                  value={splitMode}
                  onChange={(event) => setSplitMode(event.target.value as SplitMode)}
                  className="h-10 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
                >
                  <option value="ranges">{t("splitRanges")}</option>
                  <option value="every">{t("splitEvery")}</option>
                  <option value="each">{t("splitEach")}</option>
                </select>
              </label>
              {splitMode !== "each" ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {splitMode === "every" ? t("everyN") : t("rangesList")}
                  <Input
                    value={splitValue}
                    onChange={(event) => setSplitValue(event.target.value)}
                    dir="ltr"
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {operation === "images" ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("pageSize")}
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(event.target.value as ImagePageSize)}
                  className="h-10 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="fit">{t("fitImage")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("margin")}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={margin}
                  onChange={(event) =>
                    setMargin(Math.min(Math.max(Number(event.target.value) || 0, 0), 100))
                  }
                />
              </label>
            </>
          ) : null}
          {operation === "metadata" && files.length ? (
            <>
              {(Object.keys(EMPTY_METADATA) as (keyof PdfMetadata)[]).map((field) => (
                <label key={field} className="flex flex-col gap-1.5 text-sm font-medium">
                  {t(`meta.${field}`)}
                  <Input
                    value={metadata[field]}
                    onChange={(event) => setMetadata({ ...metadata, [field]: event.target.value })}
                    dir="auto"
                  />
                </label>
              ))}
            </>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={!ready}
            loading={busy}
            onClick={() => void run()}
            data-private-run
          >
            {t("run")}
          </Button>
        </aside>
      </div>
    </div>
  );
}
