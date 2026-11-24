"use client";

import {
  Bot,
  Code2,
  Database,
  Gauge,
  ListChecks,
  PackageX,
  ShieldAlert,
  Timer,
  UserCheck,
  UserPlus,
  Users,
  UserRound,
  Wrench,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import {
  AreaChart,
  Avatar,
  CHART_COLORS,
  Donut,
  Meter,
  Panel,
  Pill,
  RankBars,
  StatCard,
} from "@/components/admin/admin-ui";
import { DataTable, type Column } from "@/components/admin/admin-table";
import { Skeleton } from "@/components/ui/skeleton";
import { findTool } from "@/config/tools";
import { useAnalytics, useJobMetrics } from "@/lib/admin";
import { useSession } from "@/lib/session";
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
    <div
      role="radiogroup"
      aria-label={t("range")}
      className="inline-flex rounded-full border border-border bg-surface p-1 shadow-soft"
    >
      {RANGES.map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            value === days
              ? "bg-cta-gradient text-primary-foreground shadow-soft"
              : "text-muted hover:text-foreground",
          )}
        >
          {t("lastDays", { days })}
        </button>
      ))}
    </div>
  );
}

export function Dashboard() {
  const t = useTranslations("adminPanel");
  const tools = useTranslations("tools");
  const format = useFormatter();
  const session = useSession();
  const [days, setDays] = useState(30);
  const query = useAnalytics(days);
  const data = query.data;
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!data) return <p className="text-danger-strong">{t("loadFailed")}</p>;
  const nameOf = (slug: string) =>
    tools.has(`${slug}.name`) ? tools(`${slug}.name`) : (findTool(slug)?.name ?? slug);
  const number = (value: number) => format.number(value);
  const dayLabel = (iso: string) =>
    iso ? format.dateTime(new Date(`${iso}T00:00:00`), { month: "short", day: "numeric" }) : "";
  const rate = data.tasks.success_rate;
  const labels = data.series.map((day) => day.date);
  const finished = data.tasks.succeeded + data.tasks.failed;
  const other = Math.max(data.tasks.in_period - finished, 0);
  const displayName = session.data?.display_name || session.data?.email || "";
  return (
    <div className="flex flex-col gap-6">
      <section
        className="relative isolate flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-(--radius-card) bg-cta-gradient p-6 text-primary-foreground shadow-lifted"
        data-admin-hero
      >
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots mask-radial opacity-25" />
        <div
          aria-hidden
          className="absolute -end-16 -top-20 -z-10 size-72 rounded-full bg-accent/40 blur-3xl"
        />
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-bold">{t("welcome", { name: displayName })}</h2>
          <p className="max-w-xl text-sm text-white/85">{t("dashboardNote")}</p>
        </div>
        <RangePicker value={days} onChange={setDays} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          large
          tone="primary"
          icon={Users}
          label={t("stats.users")}
          value={number(data.users.total)}
          hint={t("stats.usersHint", { verified: data.users.verified, admins: data.users.admins })}
        />
        <StatCard
          large
          tone="accent"
          icon={ListChecks}
          label={t("stats.tasks")}
          value={number(data.tasks.in_period)}
          hint={t("stats.tasksAll", { count: data.tasks.total })}
        />
        <StatCard
          large
          tone="success"
          icon={Gauge}
          label={t("stats.successRate")}
          value={rate === null ? "-" : `${rate}%`}
          hint={t("stats.failedCount", { count: data.tasks.failed })}
        />
        <StatCard
          large
          tone="info"
          icon={Timer}
          label={t("stats.avgTime")}
          value={`${data.tasks.avg_seconds}s`}
          hint={t("stats.p95", { seconds: data.tasks.p95_seconds })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="primary"
          icon={UserPlus}
          label={t("stats.newUsers")}
          value={number(data.users.new_in_period)}
          hint={t("stats.newWeek", { count: data.users.new_this_week })}
        />
        <StatCard
          tone="success"
          icon={UserCheck}
          label={t("stats.activeUsers")}
          value={number(data.users.active_this_week)}
          hint={t("stats.activeHint")}
        />
        <StatCard
          tone="warning"
          icon={UserRound}
          label={t("stats.guestTasks")}
          value={number(data.tasks.guest)}
          hint={t("stats.signedInTasks", { count: data.tasks.signed_in })}
        />
        <StatCard
          tone="info"
          icon={Code2}
          label={t("stats.apiTasks")}
          value={number(data.tasks.via_api)}
        />
        <StatCard
          tone="accent"
          icon={Database}
          label={t("stats.dataProcessed")}
          value={formatBytes(data.tasks.input_bytes)}
          hint={t("stats.dataOut", { size: formatBytes(data.tasks.output_bytes) })}
        />
        <StatCard
          tone="primary"
          icon={Bot}
          label={t("stats.aiRequests")}
          value={number(data.ai_requests)}
        />
        <StatCard
          tone={data.open_reports > 0 ? "danger" : "success"}
          icon={ShieldAlert}
          label={t("stats.openReports")}
          value={number(data.open_reports)}
        />
        <StatCard
          tone="warning"
          icon={PackageX}
          label={t("stats.toolsUnused")}
          value={number(data.unused_tools.length)}
          hint={t("stats.toolsUnusedHint", { days: data.days })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title={t("charts.tasks")} subtitle={t("lastDays", { days: data.days })}>
          <AreaChart
            ariaLabel={t("charts.tasks")}
            labels={labels}
            formatLabel={dayLabel}
            series={[
              {
                key: "tasks",
                label: t("charts.legendTasks"),
                color: "var(--primary)",
                values: data.series.map((day) => day.tasks),
              },
              {
                key: "failed",
                label: t("charts.legendFailed"),
                color: "var(--danger)",
                values: data.series.map((day) => day.failed),
              },
            ]}
          />
        </Panel>
        <Panel title={t("charts.outcome")} subtitle={t("lastDays", { days: data.days })}>
          <Donut
            ariaLabel={t("charts.outcome")}
            center={rate === null ? "-" : `${rate}%`}
            centerLabel={t("stats.successRate")}
            slices={[
              {
                key: "ok",
                label: t("charts.succeeded"),
                value: data.tasks.succeeded,
                color: "var(--success)",
              },
              {
                key: "bad",
                label: t("charts.failed"),
                value: data.tasks.failed,
                color: "var(--danger)",
              },
              { key: "other", label: t("charts.other"), value: other, color: "var(--warning)" },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title={t("charts.signups")} subtitle={t("lastDays", { days: data.days })}>
          <AreaChart
            ariaLabel={t("charts.signups")}
            labels={labels}
            formatLabel={dayLabel}
            series={[
              {
                key: "signups",
                label: t("charts.legendSignups"),
                color: "var(--accent)",
                values: data.series.map((day) => day.signups),
              },
            ]}
          />
        </Panel>
        <Panel title={t("charts.categories")} subtitle={t("lastDays", { days: data.days })}>
          {data.categories.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <Donut
              ariaLabel={t("charts.categories")}
              center={number(data.tasks.in_period)}
              centerLabel={t("stats.tasks")}
              slices={data.categories.slice(0, 6).map((row, index) => ({
                key: row.category,
                label: row.category,
                value: row.total,
                color: CHART_COLORS[index % CHART_COLORS.length],
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={t("charts.topTools")} subtitle={t("lastDays", { days: data.days })}>
          {data.top_tools.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <RankBars
              rows={data.top_tools.map((row) => ({
                key: row.tool,
                name: nameOf(row.tool),
                value: row.total,
                display: number(row.total),
              }))}
            />
          )}
        </Panel>
        <Panel title={t("charts.recentUsers")}>
          {data.recent_users.length === 0 ? (
            <p className="text-sm text-muted">{t("noData")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.recent_users.map((person) => (
                <li key={person.id} className="flex items-center gap-3">
                  <Avatar name={person.display_name || person.email} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {person.display_name || person.email}
                    </span>
                    <span className="truncate text-xs text-muted" dir="ltr">
                      {person.email}
                    </span>
                  </span>
                  <span className="ms-auto shrink-0 text-xs text-muted">
                    {format.relativeTime(new Date(person.created_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={t("charts.unusedTools", { days: data.days })}
        subtitle={data.unused_tools.length ? t("unusedHint") : undefined}
      >
        {data.unused_tools.length === 0 ? (
          <p className="text-sm text-muted">{t("allToolsUsed")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.unused_tools.map((slug) => (
              <li key={slug}>
                <Pill tone="warning">{nameOf(slug)}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>
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
  const nameOf = (slug: string) =>
    tools.has(`${slug}.name`) ? tools(`${slug}.name`) : (findTool(slug)?.name ?? slug);
  const grand = rows.reduce((sum, row) => sum + row.total, 0);
  const succeeded = rows.reduce((sum, row) => sum + row.succeeded, 0);
  const failed = rows.reduce((sum, row) => sum + row.failed, 0);
  const topTotal = rows[0]?.total ?? 1;
  const slowest = [...rows].sort((a, b) => b.avg_seconds - a.avg_seconds)[0];
  const worst = [...rows]
    .filter((row) => row.succeeded + row.failed >= 3)
    .sort((a, b) => b.failed / (b.succeeded + b.failed) - a.failed / (a.succeeded + a.failed))[0];
  const done = succeeded + failed;
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "tool",
      header: t("cols.tool"),
      sortValue: (row) => nameOf(row.tool).toLowerCase(),
      cell: (row) => <span className="font-medium">{nameOf(row.tool)}</span>,
    },
    {
      key: "total",
      header: t("cols.total"),
      sortValue: (row) => row.total,
      cell: (row) => (
        <div className="flex min-w-28 flex-col gap-1">
          <span className="font-semibold tabular-nums">{format.number(row.total)}</span>
          <Meter value={(row.total / topTotal) * 100} tone="primary" />
        </div>
      ),
    },
    {
      key: "share",
      header: t("cols.share"),
      sortValue: (row) => row.total,
      cell: (row) => (
        <span className="text-muted tabular-nums">
          {grand ? `${((row.total / grand) * 100).toFixed(1)}%` : "-"}
        </span>
      ),
    },
    {
      key: "rate",
      header: t("cols.successRate"),
      sortValue: (row) =>
        row.succeeded + row.failed ? row.succeeded / (row.succeeded + row.failed) : -1,
      cell: (row) => {
        const finished = row.succeeded + row.failed;
        if (!finished) return "-";
        const success = Math.round((row.succeeded / finished) * 100);
        return (
          <Pill tone={success >= 90 ? "success" : success >= 70 ? "warning" : "danger"}>
            {success}%
          </Pill>
        );
      },
    },
    {
      key: "failed",
      header: t("cols.failed"),
      sortValue: (row) => row.failed,
      cell: (row) =>
        row.failed > 0 ? (
          <Pill tone="danger">{format.number(row.failed)}</Pill>
        ) : (
          <span className="text-muted">0</span>
        ),
    },
    {
      key: "avg",
      header: t("cols.avg"),
      sortValue: (row) => row.avg_seconds,
      cell: (row) => <span className="tabular-nums">{row.avg_seconds}s</span>,
    },
    {
      key: "p95",
      header: t("cols.p95"),
      sortValue: (row) => row.p95_seconds,
      cell: (row) => <span className="tabular-nums">{row.p95_seconds}s</span>,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("toolsNote")}</p>
        <RangePicker value={days} onChange={setDays} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="primary"
          icon={ListChecks}
          label={t("toolsPage.runs")}
          value={format.number(grand)}
        />
        <StatCard tone="accent" icon={Wrench} label={t("toolsPage.used")} value={rows.length} />
        <StatCard
          tone={done && succeeded / done < 0.8 ? "warning" : "success"}
          icon={Gauge}
          label={t("stats.successRate")}
          value={done ? `${Math.round((succeeded / done) * 100)}%` : "-"}
          hint={worst ? t("toolsPage.worst", { name: nameOf(worst.tool) }) : undefined}
        />
        <StatCard
          tone="info"
          icon={Timer}
          label={t("toolsPage.slowest")}
          value={slowest ? `${slowest.avg_seconds}s` : "-"}
          hint={slowest ? nameOf(slowest.tool) : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.tool}
        pageSize={25}
        minWidth="48rem"
        initialSort={{ key: "total", dir: "desc" }}
        empty={t("noData")}
      />
    </div>
  );
}
