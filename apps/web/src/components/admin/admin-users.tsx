"use client";

import {
  CalendarClock,
  Database,
  FileText,
  Gauge,
  KeyRound,
  ListChecks,
  Mail,
  MailWarning,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
  Users as UsersIcon,
  Webhook,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/admin-table";
import {
  Avatar,
  Panel,
  Pill,
  RankBars,
  StatCard,
  Switch,
  type Tone,
} from "@/components/admin/admin-ui";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import { findTool } from "@/config/tools";
import { useRouter } from "@/i18n/navigation";
import {
  useAdminMutations,
  useAdminUserDetail,
  useAdminUsers,
  useAnalytics,
  type AdminUser,
} from "@/lib/admin";
import { formatBytes } from "@/lib/utils";

type ToggleField = "is_active" | "is_admin" | "retention_extended";

function useToolName() {
  const tools = useTranslations("tools");
  return (slug: string) =>
    tools.has(`${slug}.name`) ? tools(`${slug}.name`) : (findTool(slug)?.name ?? slug);
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-end font-medium">{value}</dd>
    </div>
  );
}

function AssetTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof KeyRound;
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/50 p-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ background: `var(--${tone})` }}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-bold tabular-nums">{value}</span>
        <span className="text-xs text-muted">{label}</span>
      </span>
    </div>
  );
}

function UserModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const nameOf = useToolName();
  const detail = useAdminUserDetail(id);
  const mutations = useAdminMutations();
  const user = detail.data;
  const toggle = (field: ToggleField, next: boolean) => {
    if (!user) return;
    mutations.patchUser.mutate({ id: user.id, body: { [field]: next } }, { onError: toastError });
  };
  const done = user ? user.tasks.succeeded + user.tasks.failed : 0;
  const rate = user && done ? Math.round((user.tasks.succeeded / done) * 100) : null;
  const when = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })
      : p("users.never");
  return (
    <Dialog open={id !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={p("users.detailTitle")}
        className="max-h-[90dvh] w-[min(58rem,calc(100vw-2rem))] max-w-none overflow-y-auto"
      >
        {!user ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="flex flex-col gap-5" data-admin-user-modal>
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-muted/60 p-4">
              <Avatar name={user.display_name || user.email} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate font-display text-lg font-semibold">
                  {user.display_name || user.email}
                </span>
                <span className="truncate text-sm text-muted" dir="ltr">
                  {user.email}
                </span>
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
                  <Pill tone={user.two_step ? "success" : "neutral"}>
                    {user.two_step ? p("users.twoStepOn") : p("users.twoStepOff")}
                  </Pill>
                  {user.locked ? <Pill tone="danger">{p("users.locked")}</Pill> : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                tone="primary"
                icon={ListChecks}
                label={p("users.tasksTotal")}
                value={format.number(user.tasks.total)}
              />
              <StatCard
                tone="accent"
                icon={CalendarClock}
                label={p("users.tasksMonth")}
                value={format.number(user.tasks.last_30_days)}
              />
              <StatCard
                tone={rate === null || rate >= 80 ? "success" : "warning"}
                icon={Gauge}
                label={p("stats.successRate")}
                value={rate === null ? "-" : `${rate}%`}
                hint={p("stats.failedCount", { count: user.tasks.failed })}
              />
              <StatCard
                tone="info"
                icon={Database}
                label={p("stats.dataProcessed")}
                value={formatBytes(user.tasks.input_bytes)}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={p("users.account")}>
                <dl>
                  <InfoRow label={p("users.joinedLabel")} value={when(user.created_at)} />
                  <InfoRow label={p("users.lastSignIn")} value={when(user.last_login_at)} />
                  <InfoRow label={p("users.language")} value={user.locale.toUpperCase()} />
                  <InfoRow
                    label={p("users.providers")}
                    value={user.oauth.length ? user.oauth.join(", ") : p("users.passwordOnly")}
                  />
                  <InfoRow
                    label={p("users.aiProvider")}
                    value={user.ai_provider ?? p("users.none")}
                  />
                  <InfoRow label={p("users.failedLogins")} value={user.failed_logins} />
                </dl>
              </Panel>
              <Panel title={p("users.assets")}>
                <div className="grid grid-cols-2 gap-3">
                  <AssetTile
                    tone="primary"
                    icon={KeyRound}
                    label={p("users.apiKeys")}
                    value={user.assets.api_keys}
                  />
                  <AssetTile
                    tone="accent"
                    icon={Webhook}
                    label={p("users.webhooks")}
                    value={user.assets.webhooks}
                  />
                  <AssetTile
                    tone="info"
                    icon={UsersIcon}
                    label={p("users.teams")}
                    value={user.assets.teams}
                  />
                  <AssetTile
                    tone="warning"
                    icon={FileText}
                    label={p("users.files")}
                    value={user.assets.library_files}
                  />
                  <AssetTile
                    tone="success"
                    icon={CalendarClock}
                    label={p("users.schedules")}
                    value={user.assets.schedules}
                  />
                  <AssetTile
                    tone="danger"
                    icon={Mail}
                    label={p("users.sessions")}
                    value={user.assets.open_sessions}
                  />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={p("users.topTools")}>
                {user.top_tools.length === 0 ? (
                  <p className="text-sm text-muted">{p("noData")}</p>
                ) : (
                  <RankBars
                    rows={user.top_tools.map((row) => ({
                      key: row.tool,
                      name: nameOf(row.tool),
                      value: row.total,
                      display: format.number(row.total),
                    }))}
                  />
                )}
              </Panel>
              <Panel title={p("users.recent")}>
                {user.recent_tasks.length === 0 ? (
                  <p className="text-sm text-muted">{p("noData")}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {user.recent_tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{nameOf(task.tool)}</span>
                          <span className="text-xs text-muted">
                            {format.relativeTime(new Date(task.created_at))}
                          </span>
                        </span>
                        <Pill
                          tone={
                            task.status === "succeeded"
                              ? "success"
                              : task.status === "failed"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {task.status === "failed" && task.error_code
                            ? task.error_code
                            : task.status}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title={p("users.controls")} subtitle={p("users.controlsSub")}>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["is_active", t("active"), user.is_active, UserCheck],
                    ["is_admin", t("admin"), user.is_admin, ShieldCheck],
                    [
                      "retention_extended",
                      t("extendedRetention"),
                      user.retention_extended,
                      Database,
                    ],
                  ] as const
                ).map(([field, label, checked, Icon]) => (
                  <label
                    key={field}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-muted" aria-hidden />
                      {label}
                    </span>
                    <Switch
                      label={label}
                      checked={checked}
                      onChange={(next) => toggle(field, next)}
                    />
                  </label>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Users() {
  const t = useTranslations("admin");
  const p = useTranslations("adminPanel");
  const format = useFormatter();
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const users = useAdminUsers(query);
  const analytics = useAnalytics(30);
  const mutations = useAdminMutations();
  const selected = local ?? params.get("user");
  const list = users.data ?? [];
  const stats = analytics.data?.users;
  const open = (id: string) => setLocal(id);
  const close = () => {
    setLocal(null);
    if (params.get("user")) router.replace("/admin/users");
  };
  const patch = (id: string, field: ToggleField, next: boolean) =>
    mutations.patchUser.mutate({ id, body: { [field]: next } }, { onError: toastError });

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: p("users.user"),
      sortValue: (row) => (row.display_name || row.email).toLowerCase(),
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.display_name || row.email} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.display_name || row.email}</span>
            <span className="truncate text-xs text-muted" dir="ltr">
              {row.email}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: p("users.status"),
      sortValue: (row) => Number(row.is_active),
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={row.is_active ? "success" : "danger"}>
            {row.is_active ? p("users.statusActive") : p("users.statusDisabled")}
          </Pill>
          {row.is_admin ? (
            <Pill tone="primary">
              <ShieldCheck className="size-3" aria-hidden />
              {t("admin")}
            </Pill>
          ) : null}
          <Pill tone={row.email_verified ? "info" : "warning"}>
            {row.email_verified ? p("users.verified") : p("users.unverified")}
          </Pill>
        </div>
      ),
    },
    {
      key: "tasks",
      header: p("users.tasksMonth"),
      sortValue: (row) => row.tasks_30d,
      cell: (row) => (
        <span className="font-semibold tabular-nums">{format.number(row.tasks_30d)}</span>
      ),
    },
    {
      key: "last",
      header: p("users.lastSignIn"),
      sortValue: (row) => row.last_login_at ?? "",
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.last_login_at ? format.relativeTime(new Date(row.last_login_at)) : p("users.never")}
        </span>
      ),
    },
    {
      key: "joined",
      header: p("users.joinedLabel"),
      sortValue: (row) => row.created_at,
      cell: (row) => (
        <span className="text-xs text-muted">
          {format.dateTime(new Date(row.created_at), { dateStyle: "medium" })}
        </span>
      ),
    },
    {
      key: "active",
      header: t("active"),
      cell: (row) => (
        <span
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Switch
            label={`${t("active")}: ${row.email}`}
            checked={row.is_active}
            onChange={(next) => patch(row.id, "is_active", next)}
          />
        </span>
      ),
    },
    {
      key: "admin",
      header: t("admin"),
      cell: (row) => (
        <span
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Switch
            label={`${t("admin")}: ${row.email}`}
            checked={row.is_admin}
            onChange={(next) => patch(row.id, "is_admin", next)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          tone="primary"
          icon={UsersIcon}
          label={p("stats.users")}
          value={stats?.total ?? "-"}
        />
        <StatCard
          tone="success"
          icon={UserCheck}
          label={p("stats.activeUsers")}
          value={stats?.active_this_week ?? "-"}
          hint={p("stats.activeHint")}
        />
        <StatCard
          tone="accent"
          icon={ShieldCheck}
          label={p("users.admins")}
          value={stats?.admins ?? "-"}
        />
        <StatCard
          tone="warning"
          icon={MailWarning}
          label={p("users.unverified")}
          value={stats?.unverified ?? "-"}
        />
        <StatCard
          tone="danger"
          icon={UserX}
          label={p("users.statusDisabled")}
          value={stats?.disabled ?? "-"}
        />
        <StatCard
          tone="info"
          icon={ShieldOff}
          label={p("users.twoStepOn")}
          value={stats?.two_step ?? "-"}
        />
      </div>
      {users.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DataTable
          columns={columns}
          rows={list}
          rowKey={(row) => row.id}
          onRowClick={(row) => open(row.id)}
          minWidth="62rem"
          initialSort={{ key: "joined", dir: "desc" }}
          empty={p("users.empty")}
          toolbar={
            <>
              <Input
                icon={<Search />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchUsers")}
                aria-label={t("searchUsers")}
                className="h-10 w-80 max-w-full"
              />
              <span className="text-xs text-muted">{p("users.clickHint")}</span>
            </>
          }
        />
      )}
      <UserModal id={selected} onClose={close} />
    </div>
  );
}
