"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Megaphone, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { announcement as staticAnnouncement } from "@/config/site";
import { apiJson } from "@/lib/api";

const STORAGE_PREFIX = "announcement-dismissed:";
const listeners = new Set<() => void>();

type RemoteAnnouncement = {
  enabled: boolean;
  message?: { en: string; ur: string };
  href?: string;
  version?: number;
};

function readDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
  } catch {
    return;
  } finally {
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function AnnouncementBar() {
  const t = useTranslations("common");
  const locale = useLocale();
  const remote = useQuery({
    queryKey: ["announcement"],
    queryFn: () => apiJson<RemoteAnnouncement>("/api/v1/announcement"),
    staleTime: 60_000,
    retry: false,
  });
  const fromServer = remote.data?.enabled
    ? {
        id: `server-${remote.data.version ?? 0}`,
        message:
          (locale === "ur" ? remote.data.message?.ur : remote.data.message?.en) ||
          remote.data.message?.en ||
          "",
        href: remote.data.href || undefined,
      }
    : null;
  const active = fromServer ?? (remote.isError ? staticAnnouncement : null);
  const dismissed = useSyncExternalStore(
    subscribe,
    () => (active ? readDismissed(active.id) : true),
    () => true,
  );
  if (!active || !active.message || dismissed) return null;
  return (
    <div role="region" aria-label={t("dismiss")} className="relative bg-cta-gradient text-white">
      <div className="container-page flex min-h-10 items-center justify-center gap-2 py-2 pe-10 text-sm">
        <Megaphone className="size-4 shrink-0" aria-hidden />
        {active.href ? (
          <a
            href={active.href}
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            {active.message}
            <ArrowRight className="flip-rtl size-3.5" aria-hidden />
          </a>
        ) : (
          <span className="font-medium">{active.message}</span>
        )}
        <button
          type="button"
          onClick={() => dismiss(active.id)}
          aria-label={t("dismiss")}
          className="absolute end-2 rounded-md p-1.5 hover:bg-white/15"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
