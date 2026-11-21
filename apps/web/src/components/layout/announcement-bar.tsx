"use client";

import { ArrowRight, Megaphone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { announcement } from "@/config/site";

const STORAGE_PREFIX = "announcement-dismissed:";
const listeners = new Set<() => void>();

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
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(announcement.id),
    () => true,
  );
  if (!announcement.message || dismissed) return null;
  return (
    <div role="region" aria-label={t("dismiss")} className="relative bg-cta-gradient text-white">
      <div className="container-page flex min-h-10 items-center justify-center gap-2 py-2 pe-10 text-sm">
        <Megaphone className="size-4 shrink-0" aria-hidden />
        {announcement.href ? (
          <a
            href={announcement.href}
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            {announcement.message}
            <ArrowRight className="flip-rtl size-3.5" aria-hidden />
          </a>
        ) : (
          <span className="font-medium">{announcement.message}</span>
        )}
        <button
          type="button"
          onClick={() => dismiss(announcement.id)}
          aria-label={t("dismiss")}
          className="absolute end-2 rounded-md p-1.5 hover:bg-white/15"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
