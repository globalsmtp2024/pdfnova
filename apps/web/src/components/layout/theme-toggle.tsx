"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const ORDER = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof ORDER)[number];

const subscribe = () => () => undefined;

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const current: ThemeChoice =
    mounted && ORDER.includes(theme as ThemeChoice) ? (theme as ThemeChoice) : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={t("switchTo", { current: t(current), next: t(next) })}
      title={t(current)}
      data-theme-toggle
    >
      <Icon aria-hidden />
    </Button>
  );
}

export function ThemeSelect() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="inline-flex rounded-full border border-border bg-surface p-1"
    >
      {ORDER.map((choice) => {
        const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
        const selected = mounted && (theme ?? "system") === choice;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(choice)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${selected ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {t(choice)}
          </button>
        );
      })}
    </div>
  );
}
