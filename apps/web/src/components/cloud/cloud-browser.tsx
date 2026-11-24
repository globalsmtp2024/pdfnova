"use client";

import { Check, ChevronRight, File as FileIcon, Folder, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloudFiles, type CloudEntry } from "@/lib/cloud";
import { formatBytes } from "@/lib/utils";

type Crumb = { id: string | null; name: string };

export function CloudBrowser({
  open,
  onOpenChange,
  provider,
  label,
  mode,
  onPick,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  label: string;
  mode: "file" | "folder";
  onPick: (entry: { id: string | null; name: string }) => void;
  busy?: boolean;
}) {
  const t = useTranslations("cloud");
  const [trail, setTrail] = useState<Crumb[]>([{ id: null, name: label }]);
  const [query, setQuery] = useState("");
  const current = trail[trail.length - 1];
  const files = useCloudFiles(open ? provider : null, current.id, query.trim());
  const visible = (files.data ?? []).filter((entry) => mode === "file" || entry.is_folder);

  const enter = (entry: CloudEntry) => {
    setQuery("");
    setTrail([...trail, { id: entry.id, name: entry.name }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          mode === "file" ? t("pickFile", { service: label }) : t("pickFolder", { service: label })
        }
        data-cloud-browser
      >
        <nav aria-label={t("location")} className="flex flex-wrap items-center gap-1 text-sm">
          {trail.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3 text-muted rtl:rotate-180" aria-hidden />
              ) : null}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setTrail(trail.slice(0, index + 1))}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="ps-9"
          />
        </div>
        {files.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : files.isError ? (
          <p className="text-sm text-danger-strong" role="alert">
            {files.error instanceof Error ? files.error.message : t("failed")}
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border">
            {visible.length ? (
              visible.map((entry) => (
                <li key={entry.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-surface-muted"
                    onClick={() =>
                      entry.is_folder ? enter(entry) : onPick({ id: entry.id, name: entry.name })
                    }
                    disabled={busy}
                    data-cloud-entry={entry.name}
                  >
                    {entry.is_folder ? (
                      <Folder className="size-4 text-primary" aria-hidden />
                    ) : (
                      <FileIcon className="size-4 text-muted" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {entry.size !== null ? (
                      <span className="text-xs text-muted tabular-nums">
                        {formatBytes(entry.size)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-muted">{t("empty")}</li>
            )}
          </ul>
        )}
        {mode === "folder" ? (
          <Button
            icon={<Check />}
            type="button"
            variant="primary"
            loading={busy}
            onClick={() => onPick({ id: current.id, name: current.name })}
            data-cloud-choose-folder
          >
            {t("saveHere")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
