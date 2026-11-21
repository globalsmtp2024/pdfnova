"use client";

import { Clock, Gift, Rocket } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toastError } from "@/components/ui/toaster";
import { findTool, POPULAR_TOOL_SLUGS } from "@/config/tools";
import { Link, useRouter } from "@/i18n/navigation";
import { useUpdateProfile } from "@/lib/account";
import { useSession } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { formatDuration } from "@/lib/utils";

const STEPS = [
  { id: "welcome", icon: Gift },
  { id: "retention", icon: Clock },
  { id: "start", icon: Rocket },
] as const;

export function Onboarding() {
  const t = useTranslations("onboarding");
  const toolT = useTranslations("tools");
  const commonT = useTranslations("common");
  const router = useRouter();
  const session = useSession();
  const update = useUpdateProfile();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const retention = session.data?.retention_extended ?? false;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-(--radius-card) border border-border bg-surface p-8 shadow-floating">
      <div className="flex items-center justify-between gap-4 text-sm text-muted">
        <span>{t("step", { current: index + 1, total: STEPS.length })}</span>
        <Link href="/tools" className="hover:text-foreground">
          {t("skip")}
        </Link>
      </div>
      <Progress
        value={(index + 1) / STEPS.length}
        label={t("step", { current: index + 1, total: STEPS.length })}
      />
      <AnimatePresence mode="wait">
        <m.div
          key={step.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          className="flex flex-col gap-4"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-lifted">
            <step.icon className="size-7" aria-hidden />
          </span>
          <h1 className="text-h2 font-bold">{t(`steps.${step.id}.title`)}</h1>
          <p className="text-muted">{t(`steps.${step.id}.body`)}</p>
          {step.id === "retention" ? (
            <div
              role="radiogroup"
              aria-label={t("steps.retention.title")}
              className="grid gap-2 sm:grid-cols-2"
            >
              {[false, true].map((extended) => (
                <button
                  key={String(extended)}
                  type="button"
                  role="radio"
                  aria-checked={retention === extended}
                  disabled={!session.data || update.isPending}
                  onClick={() =>
                    update.mutate({ retention_extended: extended }, { onError: toastError })
                  }
                  className="rounded-xl border border-border p-4 text-start font-medium transition-colors aria-checked:border-primary aria-checked:bg-primary-subtle"
                >
                  {formatDuration(extended ? 86400 : 3600)}
                </button>
              ))}
            </div>
          ) : null}
          {step.id === "start" ? (
            <ul className="grid grid-cols-2 gap-2">
              {POPULAR_TOOL_SLUGS.slice(0, 4).map((slug) => {
                const tool = findTool(slug);
                return tool ? (
                  <li key={slug}>
                    <Link
                      href={`/tools/${slug}`}
                      className="group flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium hover:border-primary/40"
                    >
                      <ToolIcon slug={slug} size="sm" />
                      {toolText(toolT, tool).name}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
          ) : null}
        </m.div>
      </AnimatePresence>
      <div className="flex justify-between gap-2">
        <Button
          variant="ghost"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(value - 1, 0))}
        >
          {commonT("back")}
        </Button>
        <Button
          variant="primary"
          onClick={() => (last ? router.push("/tools") : setIndex((value) => value + 1))}
        >
          {last ? t("finish") : t("next")}
        </Button>
      </div>
    </div>
  );
}
