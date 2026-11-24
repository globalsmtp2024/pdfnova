"use client";

import {
  ArrowRight,
  Clock,
  Eraser,
  FileUp,
  Gift,
  ShieldCheck,
  Smartphone,
  UserX,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { MeshBackground } from "@/components/ui/backgrounds";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { detectFileKind, findTool, suggestTools, type FileKind } from "@/config/tools";
import { Link, useRouter } from "@/i18n/navigation";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { formatBytes } from "@/lib/utils";
import { usePendingFiles } from "@/stores/pending-files";

const FLOATING = [
  { slug: "merge", className: "start-[4%] top-[18%]", depth: 40 },
  { slug: "compress", className: "end-[5%] top-[14%]", depth: 70 },
  { slug: "sign", className: "start-[9%] bottom-[22%]", depth: 55 },
  { slug: "pdf-to-word", className: "end-[8%] bottom-[26%]", depth: 30 },
  { slug: "ai-summarize", className: "start-[18%] top-[6%]", depth: 85 },
  { slug: "protect", className: "end-[17%] top-[4%]", depth: 50 },
];

export function SmartDropzone({ size = "hero" }: { size?: "hero" | "compact" }) {
  const t = useTranslations("home");
  const toolT = useTranslations("tools");
  const [files, setFiles] = useState<File[]>([]);
  const setPending = usePendingFiles((state) => state.setFiles);
  const router = useRouter();
  const available = useAvailableTools();
  const availableSlugs = useMemo(
    () => new Set(available.data?.map((tool) => tool.slug)),
    [available.data],
  );
  const kinds = files
    .map((file) => detectFileKind(file))
    .filter((kind): kind is FileKind => kind !== null);
  const ready = suggestTools(kinds, files.length).filter((tool) => availableSlugs.has(tool.slug));
  const unknownCount = files.length - kinds.length;
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const openTool = (slug: string) => {
    setPending(files);
    router.push(`/tools/${slug}`);
  };

  return (
    <div className="w-full">
      <Dropzone
        size={size}
        title={t("dropTitle")}
        subtitle={t("dropSubtitle")}
        onFiles={(dropped) => setFiles((previous) => [...previous, ...dropped])}
        className="bg-surface/80 backdrop-blur-md"
      />
      <AnimatePresence>
        {files.length > 0 ? (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 rounded-(--radius-card) border border-border bg-surface p-5 text-start shadow-lifted"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium">
                <FileUp className="size-4 text-primary" aria-hidden />
                {t("detected", { count: files.length, size: formatBytes(totalSize) })}
              </p>
              <Button icon={<Eraser />} variant="ghost" size="sm" onClick={() => setFiles([])}>
                {t("clear")}
              </Button>
            </div>
            {unknownCount > 0 ? (
              <p className="mt-2 text-sm text-warning-strong">
                {t("unknownFiles", { count: unknownCount })}
              </p>
            ) : null}
            {ready.length > 0 ? (
              <>
                <p className="mt-4 text-sm text-muted">{t("suggestionsTitle")}</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ready.map((tool) => {
                    const text = toolText(toolT, tool);
                    return (
                      <li key={tool.slug}>
                        <button
                          type="button"
                          onClick={() => openTool(tool.slug)}
                          className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start transition-colors hover:border-primary/50 hover:bg-primary-subtle/40"
                        >
                          <ToolIcon slug={tool.slug} size="sm" />
                          <span className="flex-1">
                            <span className="block text-sm font-semibold">{text.name}</span>
                            <span className="block text-xs text-muted">{text.description}</span>
                          </span>
                          <ArrowRight
                            className="flip-rtl size-4 text-muted transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">
                {kinds.length === 0 ? t("noDetection") : t("noSuggestions")}{" "}
                <Link className="font-medium text-primary hover:underline" href="/tools">
                  {t("grid.eyebrow")}
                </Link>
              </p>
            )}
            {files.length === 1 && kinds[0] === "pdf" && availableSlugs.has("merge") ? (
              <p className="mt-3 text-xs text-muted">{t("mergeTip")}</p>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FloatingIcons() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {FLOATING.map((entry, index) => (
        <FloatingIcon
          key={entry.slug}
          entry={entry}
          index={index}
          scrollY={scrollY}
          reduceMotion={Boolean(reduceMotion)}
        />
      ))}
    </div>
  );
}

function FloatingIcon({
  entry,
  index,
  scrollY,
  reduceMotion,
}: {
  entry: (typeof FLOATING)[number];
  index: number;
  scrollY: ReturnType<typeof useScroll>["scrollY"];
  reduceMotion: boolean;
}) {
  const y = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : -entry.depth]);
  if (!findTool(entry.slug)) return null;
  return (
    <m.div className={`absolute ${entry.className}`} style={{ y }}>
      <div
        className="animate-float rounded-2xl border border-border bg-surface/80 p-2.5 shadow-lifted backdrop-blur"
        style={{ animationDelay: `${index * 0.8}s` }}
      >
        <ToolIcon slug={entry.slug} size="lg" />
      </div>
    </m.div>
  );
}

export function Hero() {
  const t = useTranslations("home");
  const trust = [
    { icon: Gift, label: t("trust.free") },
    { icon: UserX, label: t("trust.noSignup") },
    { icon: Clock, label: t("trust.autoDelete") },
    { icon: Smartphone, label: t("trust.anyDevice") },
  ];
  return (
    <section className="relative isolate overflow-hidden">
      <MeshBackground />
      <FloatingIcons />
      <div className="relative container-page flex flex-col items-center gap-8 pt-14 pb-16 text-center sm:pt-20 sm:pb-24">
        <div className="flex max-w-3xl flex-col items-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-soft backdrop-blur">
            <ShieldCheck className="size-3.5 text-success-strong" aria-hidden />
            {t("eyebrow")}
          </span>
          <h1 className="text-display font-extrabold tracking-tight">
            {t("titleStart")} <span className="text-gradient-animated">{t("titleGradient")}</span>
          </h1>
          <p className="max-w-2xl text-lg text-muted">{t("subtitle")}</p>
        </div>
        <div className="w-full max-w-3xl">
          <SmartDropzone />
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {trust.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-sm text-muted backdrop-blur"
            >
              <item.icon className="size-4 text-primary" aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
