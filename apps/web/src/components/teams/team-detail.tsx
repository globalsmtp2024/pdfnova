"use client";

import { FolderOpen, Mail, Trash2, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { useTeam, useTeamMutations, useTeamWorkflows } from "@/lib/teams";
import { cn } from "@/lib/utils";

export function TeamDetailView({ id }: { id: string }) {
  const t = useTranslations("teams");
  const router = useRouter();
  const session = useSession();
  const signedIn = Boolean(session.data);
  const team = useTeam(id, signedIn);
  const workflows = useTeamWorkflows(id, signedIn);
  const mutations = useTeamMutations(id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  if (team.isPending) return <Skeleton className="h-60 w-full" />;
  if (!team.data) {
    return (
      <p className="text-danger-strong" role="alert">
        {t("notFound")}
      </p>
    );
  }
  const data = team.data;
  const can = (permission: string) => data.permissions.includes(permission);
  const myId = session.data?.id;
  const assignable = data.role === "owner" ? ["admin", "member", "viewer"] : ["member", "viewer"];

  return (
    <div className="flex flex-col gap-8" data-team-detail>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">{data.name}</h1>
          <Badge tone="primary">{t(`role.${data.role}`)}</Badge>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/files?team=${data.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <FolderOpen aria-hidden />
            {t("sharedFiles")}
          </Link>
          {can("team.delete") ? (
            <Button
              variant="outline"
              onClick={() =>
                mutations.remove.mutate(undefined, {
                  onSuccess: () => router.push("/dashboard/teams"),
                  onError: toastError,
                })
              }
            >
              <Trash2 aria-hidden />
              {t("deleteTeam")}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t("members")}</h2>
        <ul className="divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
          {data.members.map((member) => {
            const isMe = member.user_id === myId;
            const editable = can("members.manage") && member.role !== "owner" && !isMe;
            return (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {member.display_name || member.email}
                  </span>
                  <span className="truncate text-xs text-muted" dir="ltr">
                    {member.email}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {editable ? (
                    <select
                      value={member.role}
                      aria-label={t("changeRole")}
                      onChange={(event) =>
                        mutations.changeRole.mutate(
                          { userId: member.user_id, role: event.target.value },
                          { onError: toastError },
                        )
                      }
                      className="h-9 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
                    >
                      {["admin", "member", "viewer"].map((entry) => (
                        <option key={entry} value={entry} disabled={!assignable.includes(entry)}>
                          {t(`role.${entry}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="neutral">{t(`role.${member.role}`)}</Badge>
                  )}
                  {editable || (isMe && member.role !== "owner") ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={isMe ? t("leave") : t("removeMember")}
                      onClick={() =>
                        mutations.removeMember.mutate(member.user_id, {
                          onSuccess: () => {
                            if (isMe) router.push("/dashboard/teams");
                          },
                          onError: toastError,
                        })
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {can("members.invite") ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">{t("invite")}</h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              mutations.invite.mutate(
                { email: email.trim(), role },
                {
                  onSuccess: () => {
                    setEmail("");
                    toast.success(t("inviteSent"));
                  },
                  onError: toastError,
                },
              );
            }}
          >
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
              {t("email")}
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                data-team-invite-email
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("roleLabel")}
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
              >
                {assignable.map((entry) => (
                  <option key={entry} value={entry}>
                    {t(`role.${entry}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="submit"
              variant="primary"
              loading={mutations.invite.isPending}
              data-team-invite
            >
              <Mail aria-hidden />
              {t("sendInvite")}
            </Button>
          </form>
          {data.invites.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {data.invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2">
                  <span dir="ltr">
                    {invite.email} · {t(`role.${invite.role}`)}
                  </span>
                  <button
                    type="button"
                    className="text-danger-strong underline"
                    onClick={() =>
                      mutations.revokeInvite.mutate(invite.id, { onError: toastError })
                    }
                  >
                    {t("revoke")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t("workflows")}</h2>
        {workflows.data && workflows.data.length ? (
          <ul className="divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
            {workflows.data.map((workflow) => (
              <li key={workflow.id} className="flex items-center justify-between gap-2 p-3">
                <span className="flex items-center gap-2">
                  <Workflow className="size-4 text-primary" aria-hidden />
                  {workflow.name}
                </span>
                <span className="flex items-center gap-2">
                  <Link
                    href={`/tools/workflow?team=${data.id}&shared=${workflow.id}`}
                    className="text-sm text-primary underline"
                  >
                    {t("openInBuilder")}
                  </Link>
                  {can("workflows.write") ? (
                    <button
                      type="button"
                      aria-label={t("delete")}
                      className="text-muted hover:text-danger-strong"
                      onClick={() =>
                        mutations.deleteWorkflow.mutate(workflow.id, { onError: toastError })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noWorkflows")}</p>
        )}
      </section>
    </div>
  );
}
