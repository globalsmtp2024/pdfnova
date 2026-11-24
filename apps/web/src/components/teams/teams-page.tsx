"use client";

import { LogIn, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/ui/blocks";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { useTeamMutations, useTeams } from "@/lib/teams";
import { cn } from "@/lib/utils";

export function TeamsPage() {
  const t = useTranslations("teams");
  const session = useSession();
  const teams = useTeams(Boolean(session.data));
  const mutations = useTeamMutations(null);
  const [name, setName] = useState("");

  if (session.isPending) return <Skeleton className="h-40 w-full" />;
  if (!session.data) {
    return (
      <EmptyState
        icon={LogIn}
        title={t("signInTitle")}
        body={t("signInBody")}
        action={
          <Link href="/auth/login" className={cn(buttonVariants({ variant: "primary" }))}>
            {t("signIn")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-teams>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          mutations.create.mutate(trimmed, {
            onSuccess: () => setName(""),
            onError: toastError,
          });
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("newTeam")}
          aria-label={t("newTeam")}
          maxLength={120}
          data-team-name
        />
        <Button
          type="submit"
          variant="primary"
          loading={mutations.create.isPending}
          data-team-create
        >
          <Plus aria-hidden />
          {t("create")}
        </Button>
      </form>
      {teams.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : teams.data && teams.data.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {teams.data.map((team) => (
            <li key={team.id}>
              <Link
                href={`/dashboard/teams/${team.id}`}
                className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-border bg-surface p-4 shadow-soft hover:border-primary/50"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{team.name}</span>
                  <span className="text-xs text-muted">
                    {t("memberCount", { count: team.member_count })}
                  </span>
                </span>
                <Badge tone={team.role === "owner" ? "primary" : "neutral"}>
                  {t(`role.${team.role}`)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Users} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
