"use client";

import { LockKeyhole, LockKeyholeOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { inspectFile } from "@/lib/tasks";

export type UnlockStatus =
  "checking" | "needs-password" | "password-entered" | "restricted" | "open";

export function unlockStatus(file: LocalFile, restricted: boolean | undefined): UnlockStatus {
  if (file.encrypted) return file.unlocked ? "password-entered" : "needs-password";
  if (restricted === undefined) return "checking";
  return restricted ? "restricted" : "open";
}

function useRestrictions(files: LocalFile[]): Record<string, boolean> {
  const [restrictions, setRestrictions] = useState<Record<string, boolean>>({});
  const pending = files
    .filter((file) => file.status === "ready" && !file.encrypted && file.uploadId)
    .map((file) => file.uploadId as string)
    .filter((id) => !(id in restrictions));
  const pendingKey = pending.join(",");

  useEffect(() => {
    if (!pendingKey) return;
    let active = true;
    for (const id of pendingKey.split(",")) {
      inspectFile(id)
        .then((inspection) => {
          if (active) setRestrictions((current) => ({ ...current, [id]: inspection.encrypted }));
        })
        .catch(() => {
          if (active) setRestrictions((current) => ({ ...current, [id]: false }));
        });
    }
    return () => {
      active = false;
    };
  }, [pendingKey]);

  return restrictions;
}

const STATUS_STYLE: Record<UnlockStatus, string> = {
  checking: "text-muted",
  "needs-password": "text-warning-strong",
  "password-entered": "text-success-strong",
  restricted: "text-warning-strong",
  open: "text-muted",
};

function StatusIcon({ status }: { status: UnlockStatus }) {
  const className = "size-4 shrink-0";
  if (status === "needs-password") return <LockKeyhole className={className} aria-hidden />;
  if (status === "password-entered") return <LockKeyholeOpen className={className} aria-hidden />;
  if (status === "restricted") return <ShieldAlert className={className} aria-hidden />;
  return <ShieldCheck className={className} aria-hidden />;
}

export function useUnlockPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_unlock");
  const restrictions = useRestrictions(files);
  const labels: Record<UnlockStatus, string> = {
    checking: t("checking"),
    "needs-password": t("needsPassword"),
    "password-entered": t("passwordEntered"),
    restricted: t("restricted"),
    open: t("notProtected"),
  };
  const ready = files.filter((file) => file.status === "ready");

  const main =
    ready.length > 0 ? (
      <section className="rounded-xl border border-border p-4" data-unlock-status>
        <h3 className="mb-2 text-sm font-medium">{t("statusTitle")}</h3>
        <ul className="flex flex-col gap-1.5">
          {ready.map((file) => {
            const status = unlockStatus(
              file,
              file.uploadId ? restrictions[file.uploadId] : undefined,
            );
            return (
              <li
                key={file.key}
                className="flex items-center justify-between gap-3 text-sm"
                data-unlock-file={file.name}
                data-unlock-state={status}
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <span className={`flex items-center gap-1.5 text-xs ${STATUS_STYLE[status]}`}>
                  <StatusIcon status={status} />
                  {labels[status]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  const options = (
    <p
      className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm"
      data-unlock-notice
    >
      {t("notice")}
    </p>
  );

  return {
    main,
    options,
    payload: {},
    problem: null,
    summary: files.length > 0 ? t("summary", { count: files.length }) : null,
  };
}
