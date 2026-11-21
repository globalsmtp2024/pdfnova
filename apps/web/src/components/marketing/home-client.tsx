"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findTool, POPULAR_TOOL_SLUGS } from "@/config/tools";
import { SOLUTIONS } from "@/content/solutions";
import { Link } from "@/i18n/navigation";
import { useAvailableTools } from "@/lib/session";

export function QuickActions() {
  const available = useAvailableTools();
  const live = new Set(available.data?.map((tool) => tool.slug));
  if (available.isPending) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {POPULAR_TOOL_SLUGS.map((slug) => (
          <li key={slug}>
            <Skeleton className="h-40" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {POPULAR_TOOL_SLUGS.map((slug) => {
        const tool = findTool(slug);
        return tool ? (
          <li key={slug}>
            <ToolCard tool={tool} live={live.has(slug)} size="lg" />
          </li>
        ) : null;
      })}
    </ul>
  );
}

function DemoDoc({ color, wide = false }: { color: string; wide?: boolean }) {
  return (
    <div
      className={`flex h-24 flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5 shadow-soft ${wide ? "w-20" : "w-16"}`}
    >
      <span className="h-2 w-8 rounded-full" style={{ background: color }} />
      <span className="h-1.5 w-full rounded-full bg-border-strong" />
      <span className="h-1.5 w-4/5 rounded-full bg-border-strong" />
      <span className="h-1.5 w-full rounded-full bg-border-strong" />
      <span className="h-1.5 w-3/5 rounded-full bg-border-strong" />
    </div>
  );
}

export function DemoStrip() {
  const t = useTranslations("home.demo");
  const [mode, setMode] = useState<"merge" | "compress">("merge");
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((value) => (value + 1) % 2), 2200);
    return () => clearInterval(timer);
  }, []);
  const colors = ["#5B4BFF", "#12B5A6", "#EC4899"];
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label={t("title")}
          className="inline-flex w-fit rounded-full border border-border bg-surface p-1"
        >
          {(["merge", "compress"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={mode === entry}
              onClick={() => setMode(entry)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${mode === entry ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {t(entry)}
            </button>
          ))}
        </div>
        <p className="text-lg">{mode === "merge" ? t("mergeCaption") : t("compressCaption")}</p>
        <p className="text-xs text-muted">{t("note")}</p>
      </div>
      <div
        aria-hidden
        className="relative flex h-56 items-center justify-center overflow-hidden rounded-(--radius-card) border border-border bg-surface-muted/60 bg-dots"
      >
        <AnimatePresence mode="wait">
          {mode === "merge" ? (
            <m.div
              key={`merge-${phase}`}
              className="flex items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {phase === 0 ? (
                colors.map((color, index) => (
                  <m.div
                    key={color}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: index * 0.12 }}
                  >
                    <DemoDoc color={color} />
                  </m.div>
                ))
              ) : (
                <m.div className="relative" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                  <div className="absolute -top-2 -left-2">
                    <DemoDoc color={colors[2]} wide />
                  </div>
                  <div className="absolute -top-1 -left-1">
                    <DemoDoc color={colors[1]} wide />
                  </div>
                  <DemoDoc color={colors[0]} wide />
                </m.div>
              )}
            </m.div>
          ) : (
            <m.div
              key={`compress-${phase}`}
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <m.div
                animate={{ scale: phase === 0 ? 1.25 : 0.85 }}
                transition={{ type: "spring", stiffness: 120, damping: 16 }}
              >
                <DemoDoc color="#12B5A6" wide />
              </m.div>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-border">
                <m.div
                  className="h-full rounded-full bg-accent"
                  animate={{ width: phase === 0 ? "100%" : "38%" }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function UseCasesCarousel() {
  const locale = useLocale();
  const scroller = useRef<HTMLUListElement>(null);
  const t = useTranslations("common");
  const scrollBy = (direction: 1 | -1) => {
    const node = scroller.current;
    if (!node) return;
    const rtl = locale === "ur" ? -1 : 1;
    node.scrollBy({ left: direction * rtl * node.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => scrollBy(-1)} aria-label={t("back")}>
          <ChevronLeft className="flip-rtl" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => scrollBy(1)}
          aria-label={t("readMore")}
        >
          <ChevronRight className="flip-rtl" aria-hidden />
        </Button>
      </div>
      <ul
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4"
      >
        {SOLUTIONS.map((solution) => (
          <li key={solution.slug} className="w-72 shrink-0 snap-start sm:w-80">
            <Link
              href={`/solutions/${solution.slug}`}
              className="gradient-border group flex h-full flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lifted"
            >
              <span
                className="flex size-12 items-center justify-center rounded-2xl text-white shadow-lifted"
                style={{ background: solution.color }}
              >
                <solution.icon className="size-6" aria-hidden />
              </span>
              <h3 className="text-h3 font-semibold">{solution.title}</h3>
              <p className="text-sm text-muted">{solution.short}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {t("learnMore")}
                <ChevronRight
                  className="flip-rtl size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
