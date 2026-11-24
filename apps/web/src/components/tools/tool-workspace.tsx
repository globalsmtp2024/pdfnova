"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  CircleAlert,
  ClipboardPaste,
  Clock,
  Link2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { FileCard } from "@/components/tools/file-card";
import { acceptForKinds, describeKinds } from "@/components/tools/file-kinds";
import { CloudImportButtons } from "@/components/cloud/cloud-actions";
import { AiBudget } from "@/components/tools/ai-budget";
import { FALLBACK_PANEL, TOOL_PANELS } from "@/components/tools/panels/registry";
import { PasswordPrompt } from "@/components/tools/password-prompt";
import { ResultPanel } from "@/components/tools/result-panel";
import { ToolIcon } from "@/components/tools/tool-icon";
import { useToolSession } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Dropzone, partitionFiles } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast, toastError } from "@/components/ui/toaster";
import type { ToolDefinition } from "@/config/tools";
import { ruleBasedSuggestions } from "@/lib/suggestions";
import { ApiError } from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import type { ToolDescription } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/utils";
import { usePendingFiles } from "@/stores/pending-files";
import { useToolPreferences } from "@/stores/tool-preferences";

const MAX_FILE_BYTES = 200 * 1024 * 1024;

function formatResetTime(error: ApiError, locale: string): string | null {
  const reset = error.details.reset_at;
  if (typeof reset !== "string") return null;
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(reset),
  );
}

function UrlImport({
  onImport,
  busy,
}: {
  onImport: (url: string) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("toolPage");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onImport(url.trim());
      setUrl("");
      setOpen(false);
    } catch (error) {
      toastError(error);
    }
  };
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Link2 aria-hidden />
        {t("importUrl")}
      </Button>
    );
  }
  return (
    <form
      onSubmit={submit}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3"
    >
      <label htmlFor="import-url" className="text-sm font-medium">
        {t("importUrlLabel")}
      </label>
      <div className="flex gap-2">
        <Input
          id="import-url"
          type="url"
          required
          inputMode="url"
          placeholder={t("importUrlPlaceholder")}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="h-10"
        />
        <Button
          icon={<Link2 />}
          type="submit"
          variant="solid"
          loading={busy}
          disabled={!url.trim()}
        >
          {t("importUrlButton")}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("importUrlHelp")}</p>
    </form>
  );
}

export function ToolWorkspace({
  definition,
  description,
  liveTools,
}: {
  definition: ToolDefinition;
  description: ToolDescription;
  liveTools: Set<string>;
}) {
  const t = useTranslations("toolPage");
  const toolT = useTranslations("tools");
  const locale = useLocale();
  const session = useToolSession(definition.slug);
  const takePending = usePendingFiles((state) => state.take);
  const takeChained = usePendingFiles((state) => state.takeChained);
  const recordUse = useToolPreferences((state) => state.recordUse);
  const user = useSession();
  const consumed = useRef(false);
  const { addFiles, addChained } = session;
  const text = toolText(toolT, definition);
  const spec = description.input_spec;
  const accept = acceptForKinds(spec.accepted_kinds);
  const enoughFiles = session.files.length >= spec.min_files;
  const usePanel = TOOL_PANELS[definition.slug] ?? FALLBACK_PANEL;
  const panel = usePanel(session.files, description.options_schema);
  const toolProblem = panel && session.allReady ? panel.problem : null;
  const canStart = session.allReady && enoughFiles && !session.starting && !toolProblem;
  const canAddMore = session.files.length < spec.max_files;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    recordUse(definition.slug);
  }, [definition.slug, recordUse]);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const pending = takePending();
    if (pending.length) addFiles(pending);
    const chained = takeChained();
    if (chained.length) addChained(chained).catch((error: unknown) => toastError(error));
  }, [addChained, addFiles, takeChained, takePending]);

  useEffect(() => {
    if (session.phase !== "select") return;
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (!pasted.length) return;
      event.preventDefault();
      const { accepted, rejected } = partitionFiles(pasted, accept, MAX_FILE_BYTES);
      rejected.forEach(({ file, reason }) => toast.error(file.name, { description: reason }));
      if (accepted.length) addFiles(accepted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, addFiles, session.phase]);

  const totalPages = session.files.reduce((sum, entry) => sum + (entry.pageCount ?? 0), 0);
  const totalSize = session.files.reduce((sum, entry) => sum + entry.size, 0);
  const suggestions = ruleBasedSuggestions(
    session.files.map((entry) => ({
      name: entry.name,
      type: entry.file?.type ?? "",
      size: entry.size,
      pageCount: entry.pageCount,
      encrypted: entry.encrypted && !entry.unlocked,
    })),
  )
    .filter((entry) => entry.tool.slug !== definition.slug && liveTools.has(entry.tool.slug))
    .slice(0, 5);

  const handleStart = async () => {
    try {
      await session.start(panel ? panel.payload : {}, panel?.secrets);
      panel?.clearSecrets?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === "fair_use_limit") {
        const time = formatResetTime(error, locale);
        toast.error(error.message, {
          description: time ? t("limitReset", { time }) : (error.hint ?? undefined),
        });
        return;
      }
      toastError(error);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.over && event.active.id !== event.over.id)
      session.reorder(String(event.active.id), String(event.over.id));
  };

  const rejectToast = (rejected: { file: File; reason: string }[]) =>
    rejected.forEach(({ file, reason }) => toast.error(file.name, { description: reason }));

  if (session.phase === "processing") {
    const progress = session.event?.progress ?? 0;
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-8 shadow-lifted"
        aria-live="polite"
        data-processing
      >
        <div className="flex items-center gap-3">
          <ToolIcon slug={definition.slug} />
          <div className="flex-1">
            <p className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              {session.event?.label || t("processing")}
            </p>
            <p className="text-xs text-muted">{text.name}</p>
          </div>
          <span className="font-mono text-sm text-muted">{Math.round(progress * 100)}%</span>
        </div>
        <Progress value={progress} label={t("processing")} />
        <div className="flex justify-end">
          <Button
            icon={<X />}
            variant="ghost"
            size="sm"
            onClick={() => session.cancel().catch((error: unknown) => toastError(error))}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (session.phase === "done" && session.task) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ResultPanel
          task={session.task}
          liveTools={liveTools}
          onDeleteNow={session.deleteNow}
          onStartOver={() => session.reset(false)}
        />
      </div>
    );
  }

  if (session.phase === "failed") {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-(--radius-card) border border-danger/30 bg-surface p-8 text-center"
        role="alert"
      >
        <CircleAlert className="size-10 text-danger-strong" aria-hidden />
        <div>
          <h2 className="text-h3 font-semibold">{session.error?.message ?? t("failedTitle")}</h2>
          {session.error?.hint ? (
            <p className="mt-1 text-sm text-muted">{session.error.hint}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button icon={<RotateCcw />} variant="solid" onClick={() => session.reset(true)}>
            {t("retry")}
          </Button>
          <Button icon={<Undo2 />} variant="ghost" onClick={() => session.reset(false)}>
            {t("startOver")}
          </Button>
        </div>
      </div>
    );
  }

  if (session.files.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3">
        <Dropzone
          size="hero"
          accept={accept}
          maxSizeBytes={MAX_FILE_BYTES}
          title={t("select", { kinds: describeKinds(spec.accepted_kinds) })}
          subtitle={t("dropHint", { count: spec.min_files, size: formatBytes(MAX_FILE_BYTES) })}
          chips={spec.accepted_kinds.map((kind) => `.${kind}`)}
          onFiles={session.addFiles}
          onReject={rejectToast}
          className="w-full shadow-lifted"
        />
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <ClipboardPaste className="size-4" aria-hidden />
            {t("pasteHint", { keys: "Ctrl V" })}
          </span>
          <UrlImport onImport={session.importUrl} busy={session.importing} />
          <CloudImportButtons onImport={session.importCloud} busy={session.importing} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-label={t("summary")} className="flex flex-col gap-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={session.files.map((entry) => entry.key)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {session.files.map((entry, index) => (
                  <m.li
                    key={entry.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    layout="position"
                  >
                    <FileCard
                      entry={entry}
                      index={index}
                      total={session.files.length}
                      onMove={(direction) => session.moveFile(entry.key, direction)}
                      onRemove={() => session.removeFile(entry.key)}
                      onRetry={() => session.retryFile(entry.key)}
                    >
                      {entry.encrypted && entry.status === "ready" ? (
                        <PasswordPrompt
                          file={entry}
                          onUnlock={(password) => session.unlockFile(entry.key, password)}
                        />
                      ) : null}
                      {panel?.renderFileExtras ? panel.renderFileExtras(entry) : null}
                    </FileCard>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          </SortableContext>
        </DndContext>
        {panel ? panel.main : null}
        {canAddMore ? (
          <>
            <Dropzone
              accept={accept}
              maxSizeBytes={MAX_FILE_BYTES}
              title={t("addMore")}
              subtitle={t("addMoreHint")}
              onFiles={session.addFiles}
              onReject={rejectToast}
              className="min-h-28 py-5"
            />
            <div className="flex justify-center">
              <UrlImport onImport={session.importUrl} busy={session.importing} />
              <CloudImportButtons onImport={session.importCloud} busy={session.importing} />
            </div>
          </>
        ) : null}
        {suggestions.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-muted/60 p-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="size-4 text-primary" aria-hidden />
              {t("suggestions")}
            </span>
            {suggestions.map(({ tool, reason }) => (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                title={t(`suggestionReason.${reason}`)}
                data-suggestion-reason={reason}
                className="group flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 ps-0.5 pe-3 hover:border-primary/50"
              >
                <ToolIcon slug={tool.slug} size="sm" />
                {toolText(toolT, tool).name}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <aside aria-label={t("options")} className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-lifted">
          <h2 className="font-display text-lg font-semibold">{t("options")}</h2>
          {panel?.options ?? <p className="text-sm text-muted">{t("noOptions")}</p>}
          {definition.category === "ai" ? <AiBudget /> : null}
          <div className="flex flex-col gap-2 rounded-xl bg-surface-muted/70 p-3 text-xs text-muted">
            <p className="font-medium text-foreground">
              {t("summaryLine", {
                files: session.files.length,
                pages: totalPages,
                size: formatBytes(totalSize),
              })}
            </p>
            {panel?.summary ? (
              <p className="font-medium text-primary" data-output-summary>
                {panel.summary}
              </p>
            ) : null}
            {toolProblem ? <p className="text-warning-strong">{toolProblem}</p> : null}
            {session.locked ? <p className="text-warning-strong">{t("lockedFiles")}</p> : null}
            {!enoughFiles ? (
              <p className="text-warning-strong">
                {t("needMore", { count: spec.min_files - session.files.length })}
              </p>
            ) : null}
            {session.task?.estimated_seconds && session.allReady ? (
              <p className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />
                {t("estimate", { duration: formatDuration(session.task.estimated_seconds) })}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success-strong" aria-hidden />
              {t("privacyLine")}
            </p>
          </div>
          <Button
            icon={<Play />}
            variant="primary"
            size="lg"
            disabled={!canStart}
            loading={session.starting}
            onClick={handleStart}
            data-start-tool
          >
            {session.uploading ? t("uploadingButton") : text.name}
          </Button>
          {!user.data ? <p className="text-center text-xs text-muted">{t("accountHint")}</p> : null}
        </div>
      </aside>
    </div>
  );
}
