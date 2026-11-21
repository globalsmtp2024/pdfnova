"use client";

import {
  ArrowRight,
  CircleCheck,
  Download,
  FileArchive,
  Link2,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toaster";
import { findTool, type ToolDefinition } from "@/config/tools";
import { useRouter } from "@/i18n/navigation";
import type { Task } from "@/lib/types";
import { toolText } from "@/lib/tool-text";
import { formatBytes, formatDuration } from "@/lib/utils";
import { usePendingFiles } from "@/stores/pending-files";

function useCountdown(target: string): number {
  const [remaining, setRemaining] = useState(() => (Date.parse(target) - Date.now()) / 1000);
  useEffect(() => {
    const timer = setInterval(() => setRemaining((Date.parse(target) - Date.now()) / 1000), 1000);
    return () => clearInterval(timer);
  }, [target]);
  return Math.max(remaining, 0);
}

const CHAIN_TARGETS: Record<string, string[]> = {
  pdf: [
    "compress",
    "protect",
    "sign",
    "page-numbers",
    "watermark",
    "rotate",
    "split",
    "organize",
    "extract-pages",
    "remove-pages",
  ],
};

export function ResultPanel({
  task,
  liveTools,
  onDeleteNow,
  onStartOver,
}: {
  task: Task;
  liveTools: Set<string>;
  onDeleteNow: () => Promise<void>;
  onStartOver: () => void;
}) {
  const t = useTranslations("toolPage");
  const toolT = useTranslations("tools");
  const router = useRouter();
  const setChained = usePendingFiles((state) => state.setChained);
  const [deleting, setDeleting] = useState(false);
  const [chaining, setChaining] = useState<string | null>(null);
  const remaining = useCountdown(task.expires_at);
  const archive = task.outputs.find((output) => output.kind === "archive");
  const files = task.outputs.filter((output) => output.kind !== "archive");
  const primary = archive ?? files[0];
  const seconds =
    task.started_at && task.finished_at
      ? Math.max((Date.parse(task.finished_at) - Date.parse(task.started_at)) / 1000, 0.1).toFixed(
          1,
        )
      : "0";
  const chainTargets = (CHAIN_TARGETS[files[0]?.kind ?? ""] ?? [])
    .filter((slug) => slug !== task.tool && liveTools.has(slug))
    .map((slug) => findTool(slug))
    .filter((tool): tool is ToolDefinition => tool !== undefined);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteNow();
      toast.success(t("deleted"));
    } catch (error) {
      toastError(error);
    } finally {
      setDeleting(false);
    }
  };

  const copyLink = async () => {
    if (!primary?.download_url) return;
    try {
      await navigator.clipboard.writeText(primary.download_url);
      toast.success(t("linkCopied"));
    } catch (error) {
      toastError(error);
    }
  };

  const chain = (slug: string) => {
    const output = files[0];
    if (!output) return;
    setChaining(slug);
    setChained([{ fileId: output.id, name: output.filename }]);
    router.push(`/tools/${slug}`);
  };

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 rounded-(--radius-card) border border-border bg-surface p-8 text-center shadow-lifted sm:p-12"
      data-result-panel
    >
      <m.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="flex size-16 items-center justify-center rounded-full bg-success-subtle text-success-strong"
      >
        <CircleCheck className="size-9" aria-hidden />
      </m.span>
      <div>
        <h2 className="text-h2 font-bold">{t("readyTitle")}</h2>
        <p className="mt-1 text-muted">
          {t("readyStats", {
            output: formatBytes(task.output_bytes),
            count: task.inputs.length,
            input: formatBytes(task.input_bytes),
            seconds,
          })}
        </p>
      </div>

      {task.files_deleted ? (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-muted">
          {t("deletedNote")}
        </p>
      ) : primary?.download_url ? (
        <div className="flex w-full max-w-md flex-col gap-3">
          <Button asChild variant="primary" size="lg">
            <a
              href={primary.download_url}
              download
              data-output={primary.filename}
              data-pages={primary.page_count ?? undefined}
            >
              {archive ? <FileArchive aria-hidden /> : <Download aria-hidden />}
              {archive ? t("downloadAll") : t("download", { name: primary.filename })}
            </a>
          </Button>
          <Button variant="outline" onClick={copyLink}>
            <Link2 aria-hidden />
            {t("copyLink")}
          </Button>
          {!archive && primary.page_count !== null ? (
            <p className="text-sm text-muted">{t("pagesShort", { count: primary.page_count })}</p>
          ) : null}
          {archive ? (
            <ul className="flex flex-col gap-1 text-start">
              {files.map((output) => (
                <li key={output.id}>
                  <a
                    href={output.download_url ?? undefined}
                    download
                    data-output={output.filename}
                    data-pages={output.page_count ?? undefined}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                  >
                    <span className="truncate">{output.filename}</span>
                    <span className="shrink-0 text-muted">
                      {output.page_count !== null
                        ? `${t("pagesShort", { count: output.page_count })} · `
                        : ""}
                      {formatBytes(output.size)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!task.files_deleted && chainTargets.length ? (
        <div className="flex w-full flex-col gap-3 border-t border-border pt-5">
          <p className="text-sm font-medium">{t("continueWith")}</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {chainTargets.map((tool) => (
              <li key={tool.slug}>
                <button
                  type="button"
                  disabled={chaining !== null}
                  onClick={() => chain(tool.slug)}
                  className="group flex items-center gap-2 rounded-full border border-border bg-surface py-1 ps-1 pe-3 text-sm font-medium transition-colors hover:border-primary/50 disabled:opacity-60"
                >
                  <ToolIcon slug={tool.slug} size="sm" />
                  {toolText(toolT, tool).name}
                  <ArrowRight className="flip-rtl size-3.5 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {!task.files_deleted ? (
          <Button variant="outline" onClick={handleDelete} loading={deleting}>
            <Trash2 aria-hidden />
            {t("deleteNow")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onStartOver}>
          <RotateCcw aria-hidden />
          {t("startOver")}
        </Button>
      </div>

      {!task.files_deleted ? (
        <p className="flex items-center gap-1.5 text-xs text-muted" aria-live="off">
          <ShieldCheck className="size-3.5 text-success-strong" aria-hidden />
          {t("autoDelete", { time: formatDuration(remaining) })}
        </p>
      ) : null}
    </m.div>
  );
}
