"use client";

import { Gauge } from "lucide-react";
import { useTranslations } from "next-intl";

import { Progress } from "@/components/ui/progress";
import { useUsage } from "@/lib/account";

export function AiBudget() {
  const t = useTranslations("aiBudget");
  const usage = useUsage();
  if (!usage.data) return null;
  const { ai_requests: window, uses_own_ai_key: ownKey } = usage.data;
  if (ownKey) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs text-muted" data-ai-budget>
        <Gauge className="size-4 shrink-0 text-primary" aria-hidden />
        {t("ownKey")}
      </p>
    );
  }
  const remaining = Math.max(window.limit - window.used, 0);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-xs" data-ai-budget>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Gauge className="size-4 text-primary" aria-hidden />
          {t("title")}
        </span>
        <span className="tabular-nums text-muted" dir="ltr">
          {window.used} / {window.limit}
        </span>
      </div>
      <Progress value={window.limit ? window.used / window.limit : 0} label={t("title")} />
      <p className="text-muted">
        {remaining > 0 ? t("remaining", { count: remaining }) : t("exhausted")}
      </p>
    </div>
  );
}
