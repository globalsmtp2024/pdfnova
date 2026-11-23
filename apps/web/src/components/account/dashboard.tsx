"use client";

import { Activity, Check, Copy, FileClock, KeyRound, LogIn, PenLine, Workflow } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";

import { ApiActivityChart } from "@/components/account/api-activity-chart";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import { findTool, POPULAR_TOOL_SLUGS } from "@/config/tools";
import { Link } from "@/i18n/navigation";
import {
  useApiKeys,
  useApiUsage,
  useCreateApiKey,
  useHistory,
  useRevokeApiKey,
  useUsage,
  type UsageWindow,
} from "@/lib/account";
import { useSession } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { useNow } from "@/lib/use-now";
import { formatBytes, formatDuration } from "@/lib/utils";

const STATUS_TONE: Record<string, "success" | "danger" | "primary" | "neutral" | "warning"> = {
  succeeded: "success",
  failed: "danger",
  running: "primary",
  queued: "primary",
  cancelled: "neutral",
  expired: "neutral",
  created: "warning",
};

export function Panel({
  title,
  icon: Icon,
  children,
  action,
  className,
}: {
  title: string;
  icon: typeof Activity;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-soft ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Icon className="size-5 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Meter({ label, window }: { label: string; window: UsageWindow }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const ratio = window.limit ? window.used / window.limit : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted tabular-nums" dir="ltr">
          {window.used} / {window.limit}
        </span>
      </div>
      <Progress value={ratio} label={label} tone={ratio >= 1 ? "danger" : "brand"} />
      {window.reset_at && window.used > 0 ? (
        <span className="text-xs text-muted">
          {t("resetsAt", {
            time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
              new Date(window.reset_at),
            ),
          })}
        </span>
      ) : null}
    </div>
  );
}

function ApiKeysPanel() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const keys = useApiKeys(true);
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await create.mutateAsync(name.trim() || "API key");
      setSecret(created.secret);
      setName("");
    } catch (error) {
      toastError(error);
    }
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  return (
    <Panel title={t("apiKeys")} icon={KeyRound}>
      {secret ? (
        <Callout tone="warning" title={t("keyCreated")}>
          <div className="mt-2 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs"
              dir="ltr"
              data-api-secret
            >
              {secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        </Callout>
      ) : null}
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="key-name" className="sr-only">
          {t("keyName")}
        </label>
        <Input
          id="key-name"
          placeholder={t("keyName")}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="h-10"
        />
        <Button type="submit" variant="solid" loading={create.isPending}>
          {t("createKey")}
        </Button>
      </form>
      {keys.isPending ? (
        <Skeleton className="h-16" />
      ) : keys.data?.length ? (
        <ul className="divide-y divide-border">
          {keys.data.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="text-xs text-muted">
                  <code className="font-mono" dir="ltr">
                    {key.prefix}…
                  </code>{" "}
                  ·{" "}
                  {key.last_used_at
                    ? t("lastUsed", { date: date(key.last_used_at) })
                    : t("neverUsed")}
                </p>
              </div>
              {key.revoked_at ? (
                <Badge>{t("revoked")}</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke.mutate(key.id, { onError: toastError })}
                >
                  {t("revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("apiKeysEmpty")}</p>
      )}
    </Panel>
  );
}

export function Dashboard() {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const locale = useLocale();
  const session = useSession();
  const now = useNow();
  const signedIn = Boolean(session.data);
  const usage = useUsage();
  const history = useHistory(signedIn);
  const apiUsage = useApiUsage(signedIn);

  if (session.isPending) return <Skeleton className="h-96" />;
  if (!session.data) {
    return (
      <EmptyState
        icon={LogIn}
        titleAs="h1"
        title={t("dashboard.signInRequired")}
        body={t("dashboard.signInBody")}
        action={
          <Button asChild variant="primary">
            <Link href="/auth/login?next=/dashboard">{t("common.signIn")}</Link>
          </Button>
        }
      />
    );
  }

  const user = session.data;
  const relative = (iso: string) => formatDuration(Math.max((Date.parse(iso) - now) / 1000, 0));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-bold tracking-tight">
          {t("dashboard.greeting", { name: user.display_name || "empty" })}
        </h1>
        <p className="mt-1 text-muted">{t("dashboard.subtitle")}</p>
      </div>
      <section aria-label={t("dashboard.quickLaunch")} className="flex gap-3 overflow-x-auto pb-1">
        {POPULAR_TOOL_SLUGS.map((slug) => {
          const tool = findTool(slug);
          if (!tool) return null;
          return (
            <Link
              key={slug}
              href={`/tools/${slug}`}
              className="group flex w-24 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 text-center text-xs font-medium hover:border-primary/40"
            >
              <ToolIcon slug={slug} />
              <span className="line-clamp-2">{toolText(toolT, tool).name}</span>
            </Link>
          );
        })}
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={t("dashboard.recent")} icon={FileClock} className="lg:col-span-2">
          {history.isPending ? (
            <Skeleton className="h-40" />
          ) : history.data?.length ? (
            <ul className="divide-y divide-border">
              {history.data.slice(0, 8).map((item) => {
                const tool = findTool(item.tool);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <ToolIcon slug={item.tool} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.file_names.join(", ") ||
                          (tool ? toolText(toolT, tool).name : item.tool)}
                      </p>
                      <p className="text-xs text-muted">
                        {tool ? toolText(toolT, tool).name : item.tool} ·{" "}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.created_at))}
                        {item.output_bytes ? ` · ${formatBytes(item.output_bytes)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={STATUS_TONE[item.status] ?? "neutral"}>
                        {t(`dashboard.statuses.${item.status}`)}
                      </Badge>
                      <span className="text-[11px] text-muted">
                        {item.files_deleted
                          ? t("dashboard.filesDeleted")
                          : t("dashboard.expiresIn", { time: relative(item.expires_at) })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("dashboard.recentEmpty")}</p>
          )}
        </Panel>
        <Panel title={t("dashboard.usage")} icon={Activity}>
          {usage.data ? (
            <div className="flex flex-col gap-4">
              <Meter label={t("dashboard.hourly")} window={usage.data.hourly_tasks} />
              <Meter label={t("dashboard.daily")} window={usage.data.daily_tasks} />
              {usage.data.uses_own_ai_key ? (
                <p className="text-sm text-success-strong">{t("dashboard.ownKey")}</p>
              ) : (
                <Meter label={t("dashboard.ai")} window={usage.data.ai_requests} />
              )}
              <p className="text-xs text-muted">{t("dashboard.usageHint")}</p>
            </div>
          ) : (
            <Skeleton className="h-40" />
          )}
        </Panel>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ApiKeysPanel />
        </div>
        <Panel title={t("dashboard.apiUsage")} icon={Activity}>
          {apiUsage.data ? (
            <ApiActivityChart days={apiUsage.data.days} title={t("dashboard.apiUsage")} />
          ) : (
            <Skeleton className="h-36" />
          )}
        </Panel>
        <Panel title={t("esign.title")} icon={PenLine}>
          <p className="text-sm text-muted">{t("esign.subtitle")}</p>
          <Link href="/dashboard/signatures" className="text-sm font-medium text-primary underline">
            {t("esign.newRequest")}
          </Link>
        </Panel>
        <Panel title={t("dashboard.workflows")} icon={Workflow} className="lg:col-span-2">
          <p className="text-sm text-muted">{t("dashboard.workflowsEmpty")}</p>
        </Panel>
        <Panel title={t("dashboard.activity")} icon={FileClock}>
          {history.data?.length ? (
            <ol className="relative ms-2 flex flex-col gap-3 border-s border-border ps-4">
              {history.data.slice(0, 5).map((item) => (
                <li key={item.id} className="text-sm">
                  <span
                    aria-hidden
                    className="absolute -start-[5px] mt-1.5 size-2.5 rounded-full bg-primary"
                  />
                  <span className="font-medium">{t(`dashboard.statuses.${item.status}`)}</span>{" "}
                  <span className="text-muted">
                    ·{" "}
                    {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
                      new Date(item.created_at),
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">{t("dashboard.recentEmpty")}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
