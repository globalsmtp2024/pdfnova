"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useJobMetrics } from "@/lib/admin";
import { cn, formatBytes } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

export function RangePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const t = useTranslations("adminPanel");
  return (
    <div role="radiogroup" aria-label={t("range")} className="flex gap-1.5">
      {RANGES.map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            value === days
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border text-muted hover:border-primary/50",
          )}
        >
          {t("lastDays", { days })}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-(--radius-card) border border-border bg-surface p-4 shadow-soft">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-4 shadow-soft">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Bars({
  data,
  color,
  label,
}: {
  data: { key: string; value: number; label: string }[];
  color: string;
  label: string;
}) {
  const max = Math.max(...data.map((entry) => entry.value), 1);
  return (
    <div role="img" aria-label={label} className="flex h-36 items-end gap-0.5" dir="ltr">
      {data.map((entry) => (
        <div
          key={entry.key}
          title={`${entry.label}: ${entry.value}`}
          className="min-w-px flex-1 rounded-t-sm"
          style={{
            height: `${Math.max((entry.value / max) * 100, entry.value > 0 ? 3 : 0.5)}%`,
            background: color,
            opacity: entry.value > 0 ? 1 : 0.2,
          }}
        />
      ))}
    </div>
  );
}

function RankList({ rows, total }: { rows: { name: string; value: number }[]; total: number }) {
  const format = useFormatter();
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.name} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium" dir="ltr">
              {row.name}
            </span>
            <span className="text-muted tabular-nums">{format.number(row.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" dir="ltr">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${total ? (row.value / total) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const t = useTranslations("adminPanel");
  const tools = useTranslations("tools");
  const format = useFormatter();
  const [days, setDays] = useState(30);
  const query = useAnalytics(days);
  const data = query.data;
  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <p className="text-danger-strong">{t("loadFailed")}</p>;
  const nameOf = (slug: string) => (tools.has(`${slug}.name`) ? tools(`${slug}.name`) : slug);
  const number = (value: number) => format.number(value);
  const rate = data.tasks.success_rate;
  const periodTotal = data.tasks.in_period;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("dashboardNote")}</p>
        <RangePicker value={days} onChange={setDays} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("stats.users")}
          value={number(data.users.total)}
          hint={t("stats.usersHint", { verified: data.users.verified, admins: data.users.admins })}
        />
        <Stat
          label={t("stats.newUsers")}
          value={number(data.users.new_in_period)}
          hint={t("stats.newWeek", { count: data.users.new_this_week })}
        />
        <Stat
          label={t("stats.activeUsers")}
          value={number(data.users.active_this_week)}
          hint={t("stats.activeHint")}
        />
        <Stat label={t("stats.openReports")} value={number(data.open_reports)} />
        <Stat
          label={t("stats.tasks")}
          value={number(periodTotal)}
          hint={t("stats.tasksAll", { count: data.tasks.total })}
        />
        <Stat
          label={t("stats.successRate")}
          value={rate === null ? "-" : `${rate}%`}
          hint={t("stats.failedCount", { count: data.tasks.failed })}
        />
        <Stat
          label={t("stats.avgTime")}
          value={`${data.tasks.avg_seconds}s`}
          hint={t("stats.p95", { seconds: data.tasks.p95_seconds })}
        />
        <Stat
          label={t("stats.dataProcessed")}
          value={formatBytes(data.tasks.input_bytes)}
          hint={t("stats.dataOut", { size: formatBytes(data.tasks.output_bytes) })}
        />
        <Stat
          label={t("stats.guestTasks")}
          value={number(data.tasks.guest)}
          hint={t("stats.signedInTasks", { count: data.tasks.signed_in })}
        />
        <Stat label={t("stats.apiTasks")} value={number(data.tasks.via_api)} />
        <Stat label={t("stats.aiRequests")} value={number(data.ai_requests)} />
        <Stat
          label={t("stats.toolsUnused")}
          value={number(data.unused_tools.length)}
          hint={t("stats.toolsUnusedHint", { days: data.days })}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("charts.tasks")}>
          <Bars
            color="var(--primary)"
            label={t("charts.tasks")}
            data={data.series.map((day) => ({ key: day.date, value: day.tasks, label: day.date }))}
          />
          <p className="text-xs text-muted">
            {t("charts.failedNote", { count: data.tasks.failed })}
          </p>
        </Card>
        <Card title={t("charts.signups")}>
          <Bars
            color="var(--success)"
            label={t("charts.signups")}
            data={data.series.map((day) => ({
              key: day.date,
              value: day.signups,
              label: day.date,
            }))}
          />
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("charts.topTools")}>
          {data.top_tools.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <RankList
              total={data.top_tools[0].total}
              rows={data.top_tools.map((row) => ({ name: nameOf(row.tool), value: row.total }))}
            />
          )}
        </Card>
        <Card title={t("charts.categories")}>
          {data.categories.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <RankList
              total={periodTotal}
              rows={data.categories.map((row) => ({ name: row.category, value: row.total }))}
            />
          )}
        </Card>
        <Card title={t("charts.recentUsers")}>
          {data.recent_users.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.recent_users.map((person) => (
                <li key={person.id} className="flex flex-col text-sm">
                  <span className="truncate font-medium" dir="ltr">
                    {person.email}
                  </span>
                  <span className="text-xs text-muted">
                    {format.dateTime(new Date(person.created_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title={t("charts.unusedTools", { days: data.days })}>
        {data.unused_tools.length === 0 ? (
          <p className="text-sm text-muted">{t("noData")}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t("unusedHint")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {data.unused_tools.map((slug) => (
                <li
                  key={slug}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs"
                  dir="ltr"
                >
                  {nameOf(slug)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

export function ToolUsage() {
  const t = useTranslations("adminPanel");
  const tools = useTranslations("tools");
  const format = useFormatter();
  const [days, setDays] = useState(30);
  const query = useJobMetrics(days);
  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  const rows = query.data?.tools ?? [];
  const nameOf = (slug: string) => (tools.has(`${slug}.name`) ? tools(`${slug}.name`) : slug);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("toolsNote")}</p>
        <RangePicker value={days} onChange={setDays} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("noData")}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface-muted">
              <tr>
                {["tool", "total", "succeeded", "failed", "successRate", "avg", "p95"].map(
                  (key) => (
                    <th key={key} scope="col" className="px-4 py-2.5 text-start font-semibold">
                      {t(`cols.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {rows.map((row) => {
                const finished = row.succeeded + row.failed;
                return (
                  <tr key={row.tool}>
                    <td className="px-4 py-2.5 font-medium">{nameOf(row.tool)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format.number(row.total)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format.number(row.succeeded)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format.number(row.failed)}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {finished ? `${Math.round((row.succeeded / finished) * 100)}%` : "-"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.avg_seconds}s</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.p95_seconds}s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
