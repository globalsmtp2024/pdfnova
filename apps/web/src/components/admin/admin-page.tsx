"use client";

import {
  Activity,
  Check,
  CircleAlert,
  CircleCheck,
  Database,
  Flag,
  Gauge,
  Siren,
  Timer,
  Wrench,
  HardDrive,
  Link2,
  ListChecks,
  Megaphone,
  Save,
  Search,
  Server,
  ShieldCheck,
  TriangleAlert,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/admin-table";
import {
  AreaChart,
  Meter,
  Panel,
  Pill,
  StatCard,
  Switch,
  TONE_VAR,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import {
  useAbuse,
  useAnalytics,
  useAdminMutations,
  useAnnouncementSettings,
  useFailures,
  useFairUse,
  useFlags,
  useHealth,
  useJobMetrics,
  type AbuseItem,
  type AnnouncementSettings,
  type Failure,
} from "@/lib/admin";
import { findTool } from "@/config/tools";
import { isWebUrl } from "@/lib/validate";
import { cn, formatBytes } from "@/lib/utils";

const BINARY_NAMES: Record<string, string> = {
  qpdf: "qpdf",
  libreoffice: "LibreOffice",
  tesseract: "Tesseract",
  chromium: "Chromium",
};

export function Overview() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const health = useHealth();
  const jobs = useJobMetrics(14);
  if (health.isPending) return <Skeleton className="h-64 w-full" />;
  const report = health.data;
  if (!report) return <p className="text-danger-strong">{t("loadFailed")}</p>;
  const checks: { label: string; ok: boolean; icon: typeof Database }[] = [
    { label: t("database"), ok: report.checks.database.ok, icon: Database },
    { label: t("storage"), ok: report.checks.storage.ok, icon: HardDrive },
    { label: t("disk"), ok: report.checks.disk.ok, icon: HardDrive },
    {
      label: t("queue", { backend: report.checks.queue.backend }),
      ok: report.checks.queue.ok,
      icon: Server,
    },
    ...Object.entries(report.checks.binaries).map(([name, value]) => ({
      label: BINARY_NAMES[name] ?? name,
      ok: value.ok,
      icon: Activity,
    })),
  ];
  const failing = checks.filter((check) => !check.ok).length;
  const { disk } = report.checks;
  const usedPercent = disk.total_bytes
    ? ((disk.total_bytes - disk.free_bytes) / disk.total_bytes) * 100
    : 0;
  const days = jobs.data?.days ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex items-center gap-4 rounded-(--radius-card) border p-5 shadow-soft"
        style={{
          background: `color-mix(in srgb, ${TONE_VAR[failing ? "warning" : "success"]} 10%, var(--surface))`,
          borderColor: `color-mix(in srgb, ${TONE_VAR[failing ? "warning" : "success"]} 35%, var(--border))`,
        }}
      >
        {failing ? (
          <TriangleAlert className="size-8 text-warning-strong" aria-hidden />
        ) : (
          <ShieldCheck className="size-8 text-success-strong" aria-hidden />
        )}
        <div className="flex flex-col">
          <span className="font-display text-lg font-semibold">
            {failing ? p("system.issues", { count: failing }) : p("system.allGood")}
          </span>
          <span className="text-sm text-muted">
            {t("uptime", { hours: Math.floor(report.uptime_seconds / 3600) })} ·{" "}
            {report.environment}
          </span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={UsersIcon} label={t("users")} value={report.counts.users} />
        <StatCard
          tone="accent"
          icon={ListChecks}
          label={t("tasks24h")}
          value={report.counts.tasks_24h}
        />
        <StatCard
          tone={report.counts.failed_24h ? "danger" : "success"}
          icon={CircleAlert}
          label={t("failed24h")}
          value={report.counts.failed_24h}
        />
        <StatCard tone="info" icon={Activity} label={t("running")} value={report.counts.running} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={t("health")}>
          <ul className="grid gap-3 sm:grid-cols-2" data-admin-health>
            {checks.map((check) => (
              <li
                key={check.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                style={{
                  background: `color-mix(in srgb, ${TONE_VAR[check.ok ? "success" : "danger"]} 6%, var(--surface))`,
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 items-center justify-center rounded-lg text-white"
                    style={{ background: TONE_VAR[check.ok ? "success" : "danger"] }}
                  >
                    <check.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{check.label}</span>
                </span>
                <Pill tone={check.ok ? "success" : "danger"}>
                  {check.ok ? (
                    <CircleCheck className="size-3.5" aria-hidden />
                  ) : (
                    <CircleAlert className="size-3.5" aria-hidden />
                  )}
                  {check.ok ? t("ok") : t("down")}
                </Pill>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("disk")}>
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between">
              <span className="font-display text-3xl font-bold tabular-nums">
                {Math.round(usedPercent)}%
              </span>
              <span className="text-xs text-muted">
                {t("diskFree", { free: formatBytes(disk.free_bytes) })}
              </span>
            </div>
            <Meter value={usedPercent} tone={usedPercent > 90 ? "danger" : "info"} />
            <p className="text-xs text-muted">{formatBytes(disk.total_bytes)}</p>
          </div>
        </Panel>
      </div>
      <Panel title={t("jobsPerDay")} subtitle={p("lastDays", { days: 14 })}>
        {days.length === 0 ? (
          <p className="text-sm text-muted">{p("noData")}</p>
        ) : (
          <AreaChart
            ariaLabel={t("jobsPerDay")}
            labels={days.map((day) => day.date)}
            formatLabel={(iso) =>
              iso
                ? format.dateTime(new Date(`${iso}T00:00:00`), { month: "short", day: "numeric" })
                : ""
            }
            series={[
              {
                key: "jobs",
                label: p("charts.legendTasks"),
                color: "var(--primary)",
                values: days.map((day) => day.total),
              },
              {
                key: "jobsfailed",
                label: p("charts.legendFailed"),
                color: "var(--danger)",
                values: days.map((day) => day.failed),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

export function Failures() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const tools = useTranslations("tools");
  const [tool, setTool] = useState("");
  const [code, setCode] = useState("");
  const failures = useFailures(tool, code);
  const analytics = useAnalytics(30);
  const rows = failures.data ?? [];
  const nameOf = (slug: string) =>
    tools.has(`${slug}.name`) ? tools(`${slug}.name`) : (findTool(slug)?.name ?? slug);
  const counts = (pick: (row: Failure) => string) => {
    const tally = new Map<string, number>();
    for (const row of rows) tally.set(pick(row), (tally.get(pick(row)) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  };
  const topTool = counts((row) => row.tool)[0];
  const topCode = counts((row) => row.error_code ?? "error")[0];
  const rate = analytics.data?.tasks.success_rate;
  const columns: Column<Failure>[] = [
    {
      key: "when",
      header: p("failures.when"),
      sortValue: (row) => row.created_at,
      cell: (row) => (
        <span className="text-xs text-muted">
          {format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short" })}
        </span>
      ),
    },
    {
      key: "tool",
      header: p("cols.tool"),
      sortValue: (row) => row.tool,
      cell: (row) => <Pill tone="primary">{nameOf(row.tool)}</Pill>,
    },
    {
      key: "code",
      header: p("failures.code"),
      sortValue: (row) => row.error_code ?? "",
      cell: (row) => <Pill tone="danger">{row.error_code ?? "error"}</Pill>,
    },
    {
      key: "who",
      header: p("failures.who"),
      sortValue: (row) => Number(row.signed_in),
      cell: (row) => (
        <Pill tone={row.signed_in ? "info" : "neutral"}>
          {row.signed_in ? p("failures.signedIn") : p("failures.guest")}
        </Pill>
      ),
    },
    {
      key: "size",
      header: p("failures.size"),
      sortValue: (row) => row.input_bytes,
      cell: (row) => <span className="tabular-nums">{formatBytes(row.input_bytes)}</span>,
    },
    {
      key: "message",
      header: p("failures.message"),
      className: "min-w-64 whitespace-normal",
      cell: (row) => <span className="text-muted">{row.error_message}</span>,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="danger"
          icon={CircleAlert}
          label={p("failures.shown")}
          value={rows.length}
          hint={p("failures.shownHint")}
        />
        <StatCard
          tone="warning"
          icon={Wrench}
          label={p("failures.topTool")}
          value={topTool ? nameOf(topTool[0]) : "-"}
          hint={topTool ? p("failures.times", { count: topTool[1] }) : undefined}
        />
        <StatCard
          tone="accent"
          icon={Activity}
          label={p("failures.topCode")}
          value={topCode ? topCode[0] : "-"}
          hint={topCode ? p("failures.times", { count: topCode[1] }) : undefined}
        />
        <StatCard
          tone="success"
          icon={Gauge}
          label={p("stats.successRate")}
          value={rate === null || rate === undefined ? "-" : `${rate}%`}
          hint={p("lastDays", { days: 30 })}
        />
      </div>
      {failures.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          minWidth="60rem"
          initialSort={{ key: "when", dir: "desc" }}
          empty={t("noFailures")}
          toolbar={
            <>
              <div className="flex flex-wrap gap-3">
                <Input
                  icon={<Search />}
                  value={tool}
                  onChange={(event) => setTool(event.target.value)}
                  placeholder={t("filterTool")}
                  aria-label={t("filterTool")}
                  className="h-10 w-52"
                  dir="ltr"
                />
                <Input
                  icon={<CircleAlert />}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t("filterCode")}
                  aria-label={t("filterCode")}
                  className="h-10 w-52"
                  dir="ltr"
                />
              </div>
              <p className="text-xs text-muted">{t("failuresPrivacy")}</p>
            </>
          }
        />
      )}
    </div>
  );
}

export function Flags() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const flags = useFlags();
  const mutations = useAdminMutations();
  return (
    <Panel title={p("settings.flagsTitle")} subtitle={p("settings.flagsSub")}>
      <ul className="flex flex-col divide-y divide-border">
        {(flags.data ?? []).map((flag) => (
          <li key={flag.key} className="flex items-center justify-between gap-4 py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <code className="font-mono text-xs font-semibold">{flag.key}</code>
                <Pill tone={flag.enabled ? "success" : "neutral"}>
                  {flag.enabled ? t("on") : t("off")}
                </Pill>
              </span>
              <span className="text-sm text-muted">{flag.description}</span>
            </span>
            <Switch
              label={flag.key}
              checked={flag.enabled}
              onChange={(next) =>
                mutations.setFlag.mutate({ key: flag.key, enabled: next }, { onError: toastError })
              }
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function humanKey(key: string) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function FairUseEditor() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const values = useFairUse();
  const mutations = useAdminMutations();
  const [edits, setEdits] = useState<Record<string, number>>({});
  return (
    <Panel title={p("settings.fairUseTitle")} subtitle={t("fairUseNote")}>
      <form
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
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
        {(values.data ?? []).map((entry) => (
          <Field key={entry.key} label={humanKey(entry.key)}>
            {(props) => (
              <Input
                id={props.id}
                type="number"
                min={1}
                dir="ltr"
                inputMode="numeric"
                value={edits[entry.key] ?? entry.value}
                onChange={(event) =>
                  setEdits({ ...edits, [entry.key]: Math.max(Number(event.target.value) || 1, 1) })
                }
              />
            )}
          </Field>
        ))}
        <div className="sm:col-span-2 xl:col-span-3">
          <Button
            icon={<Save />}
            type="submit"
            variant="primary"
            disabled={!Object.keys(edits).length}
            loading={mutations.saveFairUse.isPending}
          >
            {t("save")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function Abuse() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const [status, setStatus] = useState("open");
  const queue = useAbuse(status);
  const open = useAbuse("open");
  const actioned = useAbuse("actioned");
  const dismissed = useAbuse("dismissed");
  const mutations = useAdminMutations();
  const resolve = (id: string, next: "actioned" | "dismissed") =>
    mutations.resolveAbuse.mutate({ id, status: next, note: "" }, { onError: toastError });
  const columns: Column<AbuseItem>[] = [
    {
      key: "kind",
      header: p("reports.kind"),
      sortValue: (row) => row.kind,
      cell: (row) => <Pill tone="warning">{row.kind}</Pill>,
    },
    {
      key: "target",
      header: p("reports.target"),
      cell: (row) => <code className="font-mono text-xs">{row.target}</code>,
    },
    {
      key: "reason",
      header: p("reports.reason"),
      className: "min-w-64 whitespace-normal",
      cell: (row) => <span>{row.reason}</span>,
    },
    {
      key: "source",
      header: p("reports.source"),
      cell: (row) => (
        <Pill tone={row.reported_by_user ? "info" : "neutral"}>
          {row.reported_by_user ? p("failures.signedIn") : p("failures.guest")}
        </Pill>
      ),
    },
    {
      key: "when",
      header: p("failures.when"),
      sortValue: (row) => row.created_at,
      cell: (row) => (
        <span className="text-xs text-muted">
          {format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: p("reports.actions"),
      cell: (row) =>
        row.status === "open" ? (
          <span className="flex gap-2">
            <Button
              icon={<Check />}
              size="sm"
              variant="solid"
              onClick={() => resolve(row.id, "actioned")}
            >
              {t("markActioned")}
            </Button>
            <Button
              icon={<X />}
              size="sm"
              variant="outline"
              onClick={() => resolve(row.id, "dismissed")}
            >
              {t("dismiss")}
            </Button>
          </span>
        ) : (
          <Pill tone={row.status === "actioned" ? "success" : "neutral"}>
            {t(`abuseStatus.${row.status}`)}
          </Pill>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          tone={open.data?.length ? "danger" : "success"}
          icon={Siren}
          label={t("abuseStatus.open")}
          value={open.data?.length ?? "-"}
        />
        <StatCard
          tone="success"
          icon={CircleCheck}
          label={t("abuseStatus.actioned")}
          value={actioned.data?.length ?? "-"}
        />
        <StatCard
          tone="info"
          icon={X}
          label={t("abuseStatus.dismissed")}
          value={dismissed.data?.length ?? "-"}
        />
      </div>
      {queue.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <DataTable
          columns={columns}
          rows={queue.data ?? []}
          rowKey={(row) => row.id}
          minWidth="56rem"
          initialSort={{ key: "when", dir: "desc" }}
          empty={t("noReports")}
          toolbar={
            <div className="inline-flex rounded-full border border-border bg-surface p-1">
              {["open", "actioned", "dismissed"].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={status === entry}
                  onClick={() => setStatus(entry)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    status === entry
                      ? "bg-cta-gradient text-primary-foreground shadow-soft"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {t(`abuseStatus.${entry}`)}
                </button>
              ))}
            </div>
          }
        />
      )}
    </div>
  );
}

export function SettingsWidgets() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const flags = useFlags();
  const fair = useFairUse();
  const announcement = useAnnouncementSettings();
  const enabled = (flags.data ?? []).filter((flag) => flag.enabled).length;
  const total = flags.data?.length ?? 0;
  const limit = (key: string) => fair.data?.find((entry) => entry.key === key)?.value ?? "-";
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        tone="primary"
        icon={Flag}
        label={p("settings.flagsOn")}
        value={`${enabled} / ${total}`}
        hint={p("settings.flagsSub")}
      />
      <StatCard
        tone={announcement.data?.enabled ? "success" : "warning"}
        icon={Megaphone}
        label={p("settings.announcementTitle")}
        value={announcement.data?.enabled ? t("on") : t("off")}
      />
      <StatCard
        tone="accent"
        icon={Gauge}
        label={p("settings.hourlyLimit")}
        value={limit("hourly_tasks")}
        hint={p("settings.perPerson")}
      />
      <StatCard
        tone="info"
        icon={Timer}
        label={p("settings.dailyLimit")}
        value={limit("daily_tasks")}
        hint={p("settings.perPerson")}
      />
    </div>
  );
}

export function AnnouncementEditor() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const current = useAnnouncementSettings();
  const mutations = useAdminMutations();
  const [draft, setDraft] = useState<AnnouncementSettings | null>(null);
  const value = draft ?? current.data;
  if (!value) return <Skeleton className="h-48 w-full" />;
  const update = (patch: Partial<AnnouncementSettings>) => setDraft({ ...value, ...patch });
  const target = value.href.trim();
  const hrefError =
    target && !(target.startsWith("/") && !target.startsWith("//")) && !isWebUrl(target, true)
      ? t("hrefInvalid")
      : null;
  return (
    <Panel
      title={p("settings.announcementTitle")}
      subtitle={p("settings.announcementSub")}
      action={
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch
            label={t("showBar")}
            checked={value.enabled}
            onChange={(next) => update({ enabled: next })}
          />
          {t("showBar")}
        </label>
      }
    >
      <div
        className="flex items-center justify-center gap-2 rounded-xl bg-cta-gradient px-4 py-2.5 text-sm text-primary-foreground"
        aria-label={p("settings.preview")}
      >
        <Megaphone className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{value.message_en || t("messageEnPlaceholder")}</span>
      </div>
      <form
        className="grid gap-4 lg:grid-cols-2"
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
        <Field label={t("href")} hint={t("hrefHint")} error={hrefError} className="lg:col-span-2">
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
        <div className="lg:col-span-2">
          <Button
            icon={<Save />}
            type="submit"
            variant="primary"
            loading={mutations.saveAnnouncement.isPending}
          >
            {t("save")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
