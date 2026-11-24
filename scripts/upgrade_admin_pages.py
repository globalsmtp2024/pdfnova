from pathlib import Path

ADMIN = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "components" / "admin"

FAILURES = '''export function Failures() {
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

'''

ABUSE = '''export function Abuse() {
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
            <Button icon={<Check />} size="sm" variant="solid" onClick={() => resolve(row.id, "actioned")}>
              {t("markActioned")}
            </Button>
            <Button icon={<X />} size="sm" variant="outline" onClick={() => resolve(row.id, "dismissed")}>
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
        <StatCard tone={open.data?.length ? "danger" : "success"} icon={Siren} label={t("abuseStatus.open")} value={open.data?.length ?? "-"} />
        <StatCard tone="success" icon={CircleCheck} label={t("abuseStatus.actioned")} value={actioned.data?.length ?? "-"} />
        <StatCard tone="info" icon={X} label={t("abuseStatus.dismissed")} value={dismissed.data?.length ?? "-"} />
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

'''


def cut(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    a = text.index(start_marker)
    b = text.index(end_marker)
    return text[:a] + replacement + text[b:]


page = ADMIN / "admin-page.tsx"
text = page.read_text(encoding="utf8")
text = cut(text, "export function Failures() {", "export function Users() {", FAILURES)
text = cut(text, "export function Users() {", "export function Flags() {", "")
text = cut(text, "export function Abuse() {", "export function AnnouncementEditor() {", ABUSE)
text = text.replace(
    'import {\n  AreaChart,\n  Avatar,\n  Meter,\n  Panel,\n  Pill,\n  StatCard,\n  Switch,\n  TableShell,\n  TD,\n  TH,\n  TONE_VAR,\n} from "@/components/admin/admin-ui";',
    'import { DataTable, type Column } from "@/components/admin/admin-table";\nimport {\n  AreaChart,\n  Meter,\n  Panel,\n  Pill,\n  StatCard,\n  Switch,\n  TONE_VAR,\n} from "@/components/admin/admin-ui";',
    1,
)
text = text.replace(
    "  CircleCheck,\n  Database,",
    "  CircleCheck,\n  Database,\n  Flag,\n  Gauge,\n  Siren,\n  Timer,\n  Wrench,",
    1,
)
text = text.replace("  useAbuse,\n", "  useAbuse,\n  useAnalytics,\n", 1)
text = text.replace("  type AnnouncementSettings,\n", "  type AbuseItem,\n  type AnnouncementSettings,\n  type Failure,\n", 1)
text = text.replace(
    'import { isWebUrl } from "@/lib/validate";',
    'import { findTool } from "@/config/tools";\nimport { isWebUrl } from "@/lib/validate";',
    1,
)
page.write_text(text, encoding="utf8")

analytics = ADMIN / "analytics.tsx"
text = analytics.read_text(encoding="utf8")
start = text.index("export function ToolUsage() {")
new_tool_usage = '''export function ToolUsage() {
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
        <span className="tabular-nums text-muted">
          {grand ? `${((row.total / grand) * 100).toFixed(1)}%` : "-"}
        </span>
      ),
    },
    {
      key: "rate",
      header: t("cols.successRate"),
      sortValue: (row) => (row.succeeded + row.failed ? row.succeeded / (row.succeeded + row.failed) : -1),
      cell: (row) => {
        const finished = row.succeeded + row.failed;
        if (!finished) return "-";
        const success = Math.round((row.succeeded / finished) * 100);
        return <Pill tone={success >= 90 ? "success" : success >= 70 ? "warning" : "danger"}>{success}%</Pill>;
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
        <StatCard tone="primary" icon={ListChecks} label={t("toolsPage.runs")} value={format.number(grand)} />
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
'''
text = text[:start] + new_tool_usage
text = text.replace(
    "  Panel,\n  Pill,\n  RankBars,\n  StatCard,\n  TableShell,\n  TD,\n  TH,\n} from \"@/components/admin/admin-ui\";",
    "  Panel,\n  Pill,\n  RankBars,\n  StatCard,\n} from \"@/components/admin/admin-ui\";\nimport { DataTable, type Column } from \"@/components/admin/admin-table\";",
    1,
)
text = text.replace("  UserRound,\n} from", "  UserRound,\n  Wrench,\n} from", 1)
text = text.replace('import { useAnalytics, useJobMetrics } from "@/lib/admin";', 'import { findTool } from "@/config/tools";\nimport { useAnalytics, useJobMetrics } from "@/lib/admin";', 1)
analytics.write_text(text, encoding="utf8")

users_page = ADMIN.parent.parent / "app" / "[locale]" / "(admin)" / "admin" / "(panel)" / "users" / "page.tsx"
text = users_page.read_text(encoding="utf8")
text = text.replace('from "@/components/admin/admin-page";', 'from "@/components/admin/admin-users";')
users_page.write_text(text, encoding="utf8")

settings_page = ADMIN.parent.parent / "app" / "[locale]" / "(admin)" / "admin" / "(panel)" / "settings" / "page.tsx"
text = settings_page.read_text(encoding="utf8")
text = text.replace("import { AnnouncementEditor, FairUseEditor, Flags }", "import { AnnouncementEditor, FairUseEditor, Flags, SettingsWidgets }")
text = text.replace("      <Flags />", "      <SettingsWidgets />\n      <Flags />")
settings_page.write_text(text, encoding="utf8")
print("ok")
