"use client";

import { Archive, CircleAlert, CircleCheck, Download, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { acceptForKinds } from "@/components/tools/file-kinds";
import { Button } from "@/components/ui/button";
import { Dropzone, partitionFiles } from "@/components/ui/dropzone";
import { Progress } from "@/components/ui/progress";
import { toastError } from "@/components/ui/toaster";
import { findTool } from "@/config/tools";
import { useBatchRunner, zipOutputs, type BatchItem } from "@/lib/batch";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { formatBytes } from "@/lib/utils";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function StatusIcon({ status }: { status: BatchItem["status"] }) {
  if (status === "done") return <CircleCheck className="size-4 text-success-strong" aria-hidden />;
  if (status === "failed") return <CircleAlert className="size-4 text-danger-strong" aria-hidden />;
  if (status === "queued") return <span className="size-4 rounded-full border border-border-strong" aria-hidden />;
  return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />;
}

export function BatchRunner() {
  const t = useTranslations("batch");
  const toolT = useTranslations("tools");
  const format = useFormatter();
  const available = useAvailableTools();
  const runner = useBatchRunner();
  const [slug, setSlug] = useState("compress");
  const [optionsText, setOptionsText] = useState("{}");
  const [zipping, setZipping] = useState(false);

  const tools = useMemo(
    () => (available.data ?? []).filter((tool) => tool.batch_ok),
    [available.data],
  );
  const tool = tools.find((entry) => entry.slug === slug) ?? tools[0];
  const accept = tool ? acceptForKinds(tool.input_spec.accepted_kinds) : [];
  const name = (value: string) => {
    const definition = findTool(value);
    return definition ? toolText(toolT, definition).name : value;
  };

  let options: Record<string, unknown> | null = {};
  try {
    const parsed: unknown = JSON.parse(optionsText || "{}");
    options = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    options = null;
  }

  const done = runner.items.filter((item) => item.status === "done").length;
  const failed = runner.items.filter((item) => item.status === "failed").length;
  const waiting = runner.items.filter((item) => item.status === "queued").length;
  const canRun = Boolean(tool) && options !== null && (waiting > 0 || failed > 0) && !runner.running;
  const properties = Object.entries(
    ((tool?.options_schema?.properties ?? {}) as Record<string, { type?: string }>),
  );

  const downloadAll = async () => {
    setZipping(true);
    try {
      const blob = await zipOutputs(runner.items);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "batch-results.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toastError(error);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-batch-runner>
      <section className="flex flex-col gap-4">
        <Dropzone
          accept={accept}
          maxSizeBytes={MAX_FILE_BYTES}
          title={t("dropTitle")}
          subtitle={t("dropHint", { size: formatBytes(MAX_FILE_BYTES) })}
          onFiles={(files) => {
            const { accepted } = partitionFiles(files, accept, MAX_FILE_BYTES);
            runner.add(accepted);
          }}
          size="compact"
        />
        {runner.items.length ? (
          <>
            <p className="text-sm" role="status" aria-live="polite" data-batch-summary>
              {t("summary", { done, failed, total: runner.items.length })}
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
              {runner.items.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 p-3" data-batch-item={item.status}>
                  <div className="flex items-center gap-2">
                    <StatusIcon status={item.status} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.file.name}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {format.number(Math.round(item.file.size / 1024))} KB
                    </span>
                    <span className="text-xs text-muted">{t(`status.${item.status}`)}</span>
                    {item.status === "failed" && tool && options ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={runner.running}
                        onClick={() => void runner.retryOne(item.key, tool.slug, options)}
                        aria-label={t("retry")}
                      >
                        <RotateCcw aria-hidden />
                      </Button>
                    ) : null}
                    {item.status !== "uploading" && item.status !== "processing" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => runner.remove(item.key)}
                        aria-label={t("remove")}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  {item.status === "uploading" || item.status === "processing" ? (
                    <Progress value={item.progress} label={item.file.name} />
                  ) : null}
                  {item.status === "failed" && item.error ? (
                    <p className="text-xs text-danger-strong" role="alert">
                      {item.error}
                    </p>
                  ) : null}
                  {item.status === "done" ? (
                    <div className="flex flex-wrap gap-2">
                      {item.outputs
                        .filter((output) => output.download_url)
                        .map((output) => (
                          <a
                            key={output.id}
                            href={output.download_url ?? undefined}
                            className="flex items-center gap-1 text-xs text-primary underline"
                          >
                            <Download className="size-3" aria-hidden />
                            {output.filename} ({formatBytes(output.size)})
                          </a>
                        ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <aside className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-lifted lg:self-start">
        <h2 className="font-display text-lg font-semibold">{t("settings")}</h2>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("tool")}
          <select
            value={tool?.slug ?? ""}
            onChange={(event) => setSlug(event.target.value)}
            className="h-10 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
            data-batch-tool
          >
            {tools.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {name(entry.slug)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("optionsJson")}
          <textarea
            rows={5}
            spellCheck={false}
            dir="ltr"
            value={optionsText}
            onChange={(event) => setOptionsText(event.target.value)}
            aria-invalid={options === null}
            className="rounded-md border border-border bg-surface p-2 font-mono text-xs"
          />
        </label>
        {options === null ? <p className="text-xs text-danger-strong">{t("badJson")}</p> : null}
        {properties.length ? (
          <p className="text-xs text-muted" dir="ltr">
            {properties.map(([key, schema]) => `${key}${schema.type ? ` (${schema.type})` : ""}`).join(", ")}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!canRun}
            loading={runner.running}
            onClick={() => tool && options && void runner.start(tool.slug, options)}
            data-batch-start
          >
            {t("start", { count: waiting + failed })}
          </Button>
          {runner.running ? (
            <Button type="button" variant="outline" onClick={runner.stop}>
              {t("stop")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={!failed || runner.running || !tool || options === null}
            onClick={() => tool && options && void runner.retryFailed(tool.slug, options)}
            data-batch-retry-failed
          >
            <RotateCcw aria-hidden />
            {t("retryFailed", { count: failed })}
          </Button>
          <Button type="button" variant="outline" disabled={!done || zipping} loading={zipping} onClick={() => void downloadAll()}>
            <Archive aria-hidden />
            {t("downloadAll")}
          </Button>
          <Button type="button" variant="ghost" disabled={runner.running || !runner.items.length} onClick={runner.clear}>
            {t("clear")}
          </Button>
        </div>
        <p className="text-xs text-muted">{t("privacy")}</p>
      </aside>
    </div>
  );
}
