"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CloudOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Readiness = { status: string; checks: Record<string, string> };

async function fetchReadiness(): Promise<Readiness & { reachable: boolean; checkedAt: number }> {
  try {
    const response = await fetch("/health/ready", { cache: "no-store" });
    const payload = (await response.json()) as Readiness;
    return { ...payload, reachable: true, checkedAt: Date.now() };
  } catch {
    return { status: "unreachable", checks: {}, reachable: false, checkedAt: Date.now() };
  }
}

export function StatusBoard() {
  const t = useTranslations("status");
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["status"],
    queryFn: fetchReadiness,
    refetchInterval: 30_000,
  });
  if (query.isPending) return <Skeleton className="h-64" />;
  const data = query.data;
  const healthy = data?.reachable && data.status === "ok";
  const Icon = !data?.reachable ? CloudOff : healthy ? CircleCheck : CircleAlert;
  const components = [
    { id: "api", ok: Boolean(data?.reachable) },
    { id: "database", ok: data?.checks.database === "ok" },
    { id: "storage", ok: data?.checks.storage === "ok" },
  ];
  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <div
        className={cn(
          "flex items-center gap-4 rounded-(--radius-card) border p-6",
          healthy ? "border-success/30 bg-success-subtle" : "border-warning/30 bg-warning-subtle",
        )}
      >
        <Icon
          className={cn("size-8", healthy ? "text-success-strong" : "text-warning-strong")}
          aria-hidden
        />
        <div>
          <p className="font-display text-xl font-semibold">
            {!data?.reachable ? t("unreachable") : healthy ? t("operational") : t("degraded")}
          </p>
          <p className="text-sm text-muted">
            {data
              ? t("checkedAt", {
                  time: new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(
                    data.checkedAt,
                  ),
                })
              : null}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
        {components.map((component) => (
          <li key={component.id} className="flex items-center justify-between px-5 py-4">
            <span className="font-medium">{t(`components.${component.id}`)}</span>
            <span
              className={cn(
                "flex items-center gap-2 text-sm",
                component.ok ? "text-success-strong" : "text-danger-strong",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", component.ok ? "bg-success" : "bg-danger")}
              />
              {component.ok ? t("ok") : t("error")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
