"use client";

import {
  Activity,
  Check,
  CircleAlert,
  CircleCheck,
  Database,
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

import {
  AreaChart,
  Avatar,
  Meter,
  Panel,
  Pill,
  StatCard,
  Switch,
  TableShell,
  TD,
  TH,
  TONE_VAR,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
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
  const [tool, setTool] = useState("");
  const [code, setCode] = useState("");
  const failures = useFailures(tool, code);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-border bg-surface p-3 shadow-soft">
        <Input
          icon={<Search />}
          value={tool}
          onChange={(event) => setTool(event.target.value)}
          placeholder={t("filterTool")}
          aria-label={t("filterTool")}
          className="h-10 w-56"
          dir="ltr"
        />
        <Input
          icon={<CircleAlert />}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("filterCode")}
          aria-label={t("filterCode")}
          className="h-10 w-56"
          dir="ltr"
        />
        <p className="ms-auto text-xs text-muted">{t("failuresPrivacy")}</p>
      </div>
      {failures.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : failures.data?.length ? (
        <ul className="flex flex-col gap-3">
          {failures.data.map((failure) => (
            <li
              key={failure.id}
              className="flex flex-col gap-2 rounded-(--radius-card) border border-s-4 border-border border-s-danger bg-surface p-4 shadow-soft"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone="primary">{failure.tool}</Pill>
                <Pill tone="danger">{failure.error_code ?? "error"}</Pill>
                <Pill tone={failure.signed_in ? "info" : "neutral"}>
                  {failure.signed_in ? p("failures.signedIn") : p("failures.guest")}
                </Pill>
                <span className="ms-auto text-xs text-muted">
                  {format.dateTime(new Date(failure.created_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · {formatBytes(failure.input_bytes)}
                </span>
              </span>
              <p className="text-sm text-muted">{failure.error_message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Panel>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CircleCheck className="size-10 text-success-strong" aria-hidden />
            <p className="text-sm text-muted">{t("noFailures")}</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function Users() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const users = useAdminUsers(query);
  const mutations = useAdminMutations();
  const list = users.data ?? [];
  const toggle = (
    id: string,
    field: "is_active" | "is_admin" | "retention_extended",
    next: boolean,
  ) => mutations.patchUser.mutate({ id, body: { [field]: next } }, { onError: toastError });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          icon={<Search />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchUsers")}
          aria-label={t("searchUsers")}
          className="h-11 w-80 max-w-full"
        />
        <Pill tone="primary">{p("users.found", { count: list.length })}</Pill>
      </div>
      {users.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <TableShell>
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className={TH}>
                  {p("users.user")}
                </th>
                <th scope="col" className={TH}>
                  {p("users.status")}
                </th>
                <th scope="col" className={TH}>
                  {p("users.activity")}
                </th>
                <th scope="col" className={TH}>
                  {t("active")}
                </th>
                <th scope="col" className={TH}>
                  {t("admin")}
                </th>
                <th scope="col" className={TH}>
                  {t("extendedRetention")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((user) => (
                <tr
                  key={user.id}
                  className="transition-colors hover:bg-surface-muted/60"
                  data-admin-user
                >
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <Avatar name={user.display_name || user.email} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {user.display_name || user.email}
                        </span>
                        <span className="truncate text-xs text-muted" dir="ltr">
                          {user.email}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone={user.is_active ? "success" : "danger"}>
                        {user.is_active ? p("users.statusActive") : p("users.statusDisabled")}
                      </Pill>
                      {user.is_admin ? (
                        <Pill tone="primary">
                          <ShieldCheck className="size-3" aria-hidden />
                          {t("admin")}
                        </Pill>
                      ) : null}
                      <Pill tone={user.email_verified ? "info" : "warning"}>
                        {user.email_verified ? p("users.verified") : p("users.unverified")}
                      </Pill>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex flex-col text-xs">
                      <span className="font-medium">
                        {t("tasks30d", { count: user.tasks_30d })}
                      </span>
                      <span className="text-muted">
                        {user.last_login_at
                          ? p("users.lastSeen", {
                              when: format.relativeTime(new Date(user.last_login_at)),
                            })
                          : p("users.neverSeen")}
                      </span>
                      <span className="text-muted">
                        {p("users.joined", {
                          date: format.dateTime(new Date(user.created_at), { dateStyle: "medium" }),
                        })}
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    <Switch
                      label={`${t("active")}: ${user.email}`}
                      checked={user.is_active}
                      onChange={(next) => toggle(user.id, "is_active", next)}
                    />
                  </td>
                  <td className={TD}>
                    <Switch
                      label={`${t("admin")}: ${user.email}`}
                      checked={user.is_admin}
                      onChange={(next) => toggle(user.id, "is_admin", next)}
                    />
                  </td>
                  <td className={TD}>
                    <Switch
                      label={`${t("extendedRetention")}: ${user.email}`}
                      checked={user.retention_extended}
                      onChange={(next) => toggle(user.id, "retention_extended", next)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
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
  const format = useFormatter();
  const [status, setStatus] = useState("open");
  const queue = useAbuse(status);
  const mutations = useAdminMutations();
  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-full border border-border bg-surface p-1 shadow-soft">
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
      {queue.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : queue.data?.length ? (
        <ul className="flex flex-col gap-3">
          {queue.data.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-(--radius-card) border border-s-4 border-border border-s-warning bg-surface p-4 shadow-soft"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone="warning">{item.kind}</Pill>
                <code className="font-mono text-xs">{item.target}</code>
                <span className="ms-auto text-xs text-muted">
                  {format.dateTime(new Date(item.created_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <p className="text-sm">{item.reason}</p>
              {item.status === "open" ? (
                <span className="flex gap-2">
                  <Button
                    icon={<Check />}
                    size="sm"
                    variant="solid"
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
                    variant="outline"
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
        <Panel>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CircleCheck className="size-10 text-success-strong" aria-hidden />
            <p className="text-sm text-muted">{t("noReports")}</p>
          </div>
        </Panel>
      )}
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
