"use client";

import { Check, Link2, Megaphone, Save, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { isWebUrl } from "@/lib/validate";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import {
  useAbuse,
  useAdminMutations,
  useAdminUsers,
  useAnnouncementSettings,
  useFailures,
  useFairUse,
  useFlags,
  useHealth,
  useJobMetrics,
  type AnnouncementSettings,
} from "@/lib/admin";
import { cn, formatBytes } from "@/lib/utils";

export function Overview() {
  const t = useTranslations("admin");
  const health = useHealth();
  const jobs = useJobMetrics(7);
  if (health.isPending) return <Skeleton className="h-40 w-full" />;
  const report = health.data;
  if (!report) return <p className="text-danger-strong">{t("loadFailed")}</p>;
  const checks: [string, boolean][] = [
    [t("database"), report.checks.database.ok],
    [t("storage"), report.checks.storage.ok],
    [t("disk"), report.checks.disk.ok],
    [t("queue", { backend: report.checks.queue.backend }), report.checks.queue.ok],
    ...Object.entries(report.checks.binaries).map(([name, value]): [string, boolean] => [
      name,
      value.ok,
    ]),
  ];
  const maxTotal = Math.max(...(jobs.data?.days.map((day) => day.total) ?? [1]), 1);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          [t("users"), report.counts.users],
          [t("tasks24h"), report.counts.tasks_24h],
          [t("failed24h"), report.counts.failed_24h],
          [t("running"), report.counts.running],
        ].map(([label, value]) => (
          <div key={label} className="rounded-(--radius-card) border border-border bg-surface p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">{t("health")}</h2>
        <ul className="flex flex-wrap gap-2" data-admin-health>
          {checks.map(([label, ok]) => (
            <li key={label}>
              <Badge tone={ok ? "success" : "danger"}>
                {label}: {ok ? t("ok") : t("down")}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          {t("diskFree", { free: formatBytes(report.checks.disk.free_bytes) })} ·{" "}
          {t("uptime", { hours: Math.floor(report.uptime_seconds / 3600) })}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">{t("jobsPerDay")}</h2>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={t("jobsPerDay")}>
          {(jobs.data?.days ?? []).map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col justify-end"
              title={`${day.date}: ${day.total} / ${day.failed}`}
            >
              <div
                className="rounded-t bg-danger/70"
                style={{ height: `${(day.failed / maxTotal) * 100}%` }}
              />
              <div
                className="bg-primary/70"
                style={{ height: `${((day.total - day.failed) / maxTotal) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-start text-xs text-muted">
              <tr>
                {["tool", "total", "failed", "avg", "p95"].map((column) => (
                  <th key={column} className="px-2 py-1 text-start">
                    {t(`col.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(jobs.data?.tools ?? []).map((tool) => (
                <tr key={tool.tool} className="border-t border-border">
                  <td className="px-2 py-1 font-mono text-xs">{tool.tool}</td>
                  <td className="px-2 py-1 tabular-nums">{tool.total}</td>
                  <td className="px-2 py-1 tabular-nums">{tool.failed}</td>
                  <td className="px-2 py-1 tabular-nums">{tool.avg_seconds}s</td>
                  <td className="px-2 py-1 tabular-nums">{tool.p95_seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function Failures() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [tool, setTool] = useState("");
  const [code, setCode] = useState("");
  const failures = useFailures(tool, code);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={tool}
          onChange={(event) => setTool(event.target.value)}
          placeholder={t("filterTool")}
          aria-label={t("filterTool")}
          className="max-w-48"
        />
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("filterCode")}
          aria-label={t("filterCode")}
          className="max-w-48"
        />
      </div>
      <p className="text-xs text-muted">{t("failuresPrivacy")}</p>
      {failures.data?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface text-sm">
          {failures.data.map((failure) => (
            <li key={failure.id} className="flex flex-col gap-1 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs">{failure.tool}</code>
                <Badge tone="danger">{failure.error_code}</Badge>
                <span className="text-xs text-muted">
                  {format.dateTime(new Date(failure.created_at), {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · {formatBytes(failure.input_bytes)}
                </span>
              </span>
              <span className="text-muted">{failure.error_message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noFailures")}</p>
      )}
    </div>
  );
}

export function Users() {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const users = useAdminUsers(query);
  const mutations = useAdminMutations();
  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchUsers")}
        aria-label={t("searchUsers")}
        className="max-w-sm"
      />
      <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface text-sm">
        {(users.data ?? []).map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
            data-admin-user
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{user.display_name || user.email}</span>
              <span className="truncate text-xs text-muted" dir="ltr">
                {user.email} · {t("tasks30d", { count: user.tasks_30d })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-3">
              {(
                [
                  ["is_active", t("active")],
                  ["is_admin", t("admin")],
                  ["retention_extended", t("extendedRetention")],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={user[field]}
                    onChange={(event) =>
                      mutations.patchUser.mutate(
                        { id: user.id, body: { [field]: event.target.checked } },
                        { onError: toastError },
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Flags() {
  const t = useTranslations("admin");
  const flags = useFlags();
  const mutations = useAdminMutations();
  return (
    <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
      {(flags.data ?? []).map((flag) => (
        <li key={flag.key} className="flex items-center justify-between gap-3 p-3">
          <span className="flex flex-col">
            <code className="font-mono text-xs">{flag.key}</code>
            <span className="text-sm text-muted">{flag.description}</span>
          </span>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flag.enabled}
              onChange={(event) =>
                mutations.setFlag.mutate(
                  { key: flag.key, enabled: event.target.checked },
                  { onError: toastError },
                )
              }
              data-admin-flag={flag.key}
            />
            {flag.enabled ? t("on") : t("off")}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function FairUseEditor() {
  const t = useTranslations("admin");
  const values = useFairUse();
  const mutations = useAdminMutations();
  const [edits, setEdits] = useState<Record<string, number>>({});
  return (
    <form
      className="grid max-w-3xl gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutations.saveFairUse.mutate(edits, {
          onSuccess: () => {
            setEdits({});
            toast.success(t("saved"));
          },
          onError: toastError,
        });
      }}
    >
      <p className="text-xs text-muted sm:col-span-2">{t("fairUseNote")}</p>
      {(values.data ?? []).map((entry) => (
        <label key={entry.key} className="flex flex-col gap-1 text-sm font-medium">
          <code className="font-mono text-xs">{entry.key}</code>
          <Input
            type="number"
            min={1}
            value={edits[entry.key] ?? entry.value}
            onChange={(event) =>
              setEdits({ ...edits, [entry.key]: Math.max(Number(event.target.value) || 1, 1) })
            }
          />
        </label>
      ))}
      <Button
        icon={<Save />}
        type="submit"
        variant="primary"
        className="sm:col-span-2 sm:justify-self-start"
        disabled={!Object.keys(edits).length}
        loading={mutations.saveFairUse.isPending}
      >
        {t("save")}
      </Button>
    </form>
  );
}

export function Abuse() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [status, setStatus] = useState("open");
  const queue = useAbuse(status);
  const mutations = useAdminMutations();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {["open", "actioned", "dismissed"].map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={status === entry}
            onClick={() => setStatus(entry)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              status === entry ? "border-primary bg-primary-subtle text-primary" : "border-border",
            )}
          >
            {t(`abuseStatus.${entry}`)}
          </button>
        ))}
      </div>
      {queue.data?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface text-sm">
          {queue.data.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <Badge>{item.kind}</Badge>
                <code className="font-mono text-xs">{item.target}</code>
                <span className="text-xs text-muted">
                  {format.dateTime(new Date(item.created_at), {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <span>{item.reason}</span>
              {item.status === "open" ? (
                <span className="flex gap-2">
                  <Button
                    icon={<Check />}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutations.resolveAbuse.mutate(
                        { id: item.id, status: "actioned", note: "" },
                        { onError: toastError },
                      )
                    }
                  >
                    {t("markActioned")}
                  </Button>
                  <Button
                    icon={<X />}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      mutations.resolveAbuse.mutate(
                        { id: item.id, status: "dismissed", note: "" },
                        { onError: toastError },
                      )
                    }
                  >
                    {t("dismiss")}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noReports")}</p>
      )}
    </div>
  );
}

export function AnnouncementEditor() {
  const t = useTranslations("admin");
  const current = useAnnouncementSettings();
  const mutations = useAdminMutations();
  const [draft, setDraft] = useState<AnnouncementSettings | null>(null);
  const value = draft ?? current.data;
  if (!value) return <Skeleton className="h-32 w-full" />;
  const update = (patch: Partial<AnnouncementSettings>) => setDraft({ ...value, ...patch });
  const target = value.href.trim();
  const hrefError =
    target && !(target.startsWith("/") && !target.startsWith("//")) && !isWebUrl(target, true)
      ? t("hrefInvalid")
      : null;
  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (hrefError) return;
        mutations.saveAnnouncement.mutate(value, {
          onSuccess: () => {
            setDraft(null);
            toast.success(t("saved"));
          },
          onError: toastError,
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        {t("showBar")}
      </label>
      <Field label={t("messageEn")} counter={{ value: value.message_en.length, max: 200 }}>
        {(props) => (
          <Input
            id={props.id}
            icon={<Megaphone />}
            placeholder={t("messageEnPlaceholder")}
            value={value.message_en}
            maxLength={200}
            onChange={(event) => update({ message_en: event.target.value })}
          />
        )}
      </Field>
      <Field label={t("messageUr")} counter={{ value: value.message_ur.length, max: 200 }}>
        {(props) => (
          <Input
            id={props.id}
            icon={<Megaphone />}
            placeholder={t("messageUrPlaceholder")}
            value={value.message_ur}
            maxLength={200}
            dir="rtl"
            onChange={(event) => update({ message_ur: event.target.value })}
          />
        )}
      </Field>
      <Field label={t("href")} hint={t("hrefHint")} error={hrefError}>
        {(props) => (
          <Input
            id={props.id}
            aria-describedby={props.describedBy}
            invalid={props.invalid}
            icon={<Link2 />}
            inputMode="url"
            enterKeyHint="done"
            placeholder="/features"
            value={value.href}
            dir="ltr"
            onChange={(event) => update({ href: event.target.value })}
          />
        )}
      </Field>
      <Button
        icon={<Save />}
        type="submit"
        variant="primary"
        className="self-start"
        loading={mutations.saveAnnouncement.isPending}
      >
        {t("save")}
      </Button>
    </form>
  );
}
