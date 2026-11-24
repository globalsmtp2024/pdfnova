"use client";

import { LogIn, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/ui/blocks";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { useTeamMutations, useTeams } from "@/lib/teams";
import { cn } from "@/lib/utils";

export function TeamsPage() {
  const t = useTranslations("teams");
  const session = useSession();
  const teams = useTeams(Boolean(session.data));
  const mutations = useTeamMutations(null);
  const form = useTranslations("form");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

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
        className="flex max-w-xl items-start gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            setNameError(form("required"));
            return;
          }
          setNameError(null);
          mutations.create.mutate(trimmed, {
            onSuccess: () => {
              setName("");
              toast.success(t("created", { name: trimmed }));
            },
            onError: toastError,
          });
        }}
      >
        <Field
          label={t("newTeam")}
          required
          error={nameError}
          counter={{ value: name.length, max: 120 }}
          className="flex-1"
        >
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<Users />}
              enterKeyHint="done"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("newTeamPlaceholder")}
              maxLength={120}
              data-team-name
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          icon={<Plus />}
          loading={mutations.create.isPending}
          className="mt-[1.65rem]"
          data-team-create
        >
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
