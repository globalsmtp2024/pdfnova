"use client";

import { CalendarClock, LogIn, Play, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState } from "@/components/ui/blocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { useLibraryFolders } from "@/lib/library";
import { useScheduleMutations, useScheduleRuns, useSchedules } from "@/lib/schedules";
import { useSession } from "@/lib/session";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-graph";
import { cn } from "@/lib/utils";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function Runs({ id }: { id: string }) {
  const t = useTranslations("schedules");
  const format = useFormatter();
  const runs = useScheduleRuns(id);
  if (!runs.data?.length) return <p className="text-sm text-muted">{t("noRuns")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
      {runs.data.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
          <span className="flex items-center gap-2">
            <Badge
              tone={
                run.status === "succeeded"
                  ? "success"
                  : run.status === "failed"
                    ? "danger"
                    : "primary"
              }
            >
              {t(`runStatus.${run.status}`)}
            </Badge>
            <span className="text-xs text-muted">{t("files", { count: run.files })}</span>
          </span>
          <span className="text-xs text-muted">
            {run.message} ·{" "}
            {format.dateTime(new Date(run.created_at), { dateStyle: "short", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SchedulesPage() {
  const t = useTranslations("schedules");
  const wt = useTranslations("workflowBuilder");
  const format = useFormatter();
  const session = useSession();
  const signedIn = Boolean(session.data);
  const schedules = useSchedules(signedIn);
  const folders = useLibraryFolders(signedIn);
  const mutations = useScheduleMutations();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(WORKFLOW_TEMPLATES[0]?.slug ?? "");
  const [frequency, setFrequency] = useState<"hourly" | "daily" | "weekly">("daily");
  const [hour, setHour] = useState(3);
  const [weekday, setWeekday] = useState(1);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [open, setOpen] = useState<string | null>(null);

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

  const chosen = WORKFLOW_TEMPLATES.find((entry) => entry.slug === template);

  return (
    <div className="flex flex-col gap-8" data-schedules>
      <Callout tone="info">{t("explain")}</Callout>
      <form
        className="grid max-w-3xl gap-3 rounded-(--radius-card) border border-border bg-surface p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!chosen) return;
          mutations.create.mutate(
            {
              name: name.trim() || wt(`template.${chosen.slug}.name`),
              nodes: chosen.nodes,
              edges: chosen.edges,
              frequency,
              hour_utc: hour,
              weekday: frequency === "weekly" ? weekday : null,
              source_folder_id: source || null,
              destination_folder_id: destination || null,
              enabled: true,
            },
            {
              onSuccess: () => {
                setName("");
                toast.success(t("created"));
              },
              onError: toastError,
            },
          );
        }}
      >
        <h2 className="font-display text-lg font-semibold sm:col-span-2">{t("addTitle")}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("name")}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            data-schedule-name
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("workflow")}
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
          >
            {WORKFLOW_TEMPLATES.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {wt(`template.${entry.slug}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("frequency")}
          <select
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as typeof frequency)}
            className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
          >
            <option value="hourly">{t("hourly")}</option>
            <option value="daily">{t("daily")}</option>
            <option value="weekly">{t("weekly")}</option>
          </select>
        </label>
        {frequency !== "hourly" ? (
          <div className="flex gap-2">
            {frequency === "weekly" ? (
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                {t("weekday")}
                <select
                  value={weekday}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                  className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`day.${day}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              {t("hourUtc")}
              <Input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(event) =>
                  setHour(Math.min(Math.max(Number(event.target.value) || 0, 0), 23))
                }
              />
            </label>
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("source")}
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
          >
            <option value="">{t("rootFolder")}</option>
            {(folders.data ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("destination")}
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
          >
            <option value="">{t("rootFolder")}</option>
            {(folders.data ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          variant="primary"
          className="self-end sm:col-span-2 sm:justify-self-start"
          loading={mutations.create.isPending}
          data-schedule-create
        >
          {t("create")}
        </Button>
      </form>

      {schedules.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : schedules.data && schedules.data.length ? (
        <ul className="flex flex-col gap-4">
          {schedules.data.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-col">
                  <span className="font-medium">{schedule.name}</span>
                  <span className="text-xs text-muted">
                    {t(schedule.frequency)}
                    {schedule.frequency !== "hourly"
                      ? ` · ${String(schedule.hour_utc).padStart(2, "0")}:00 UTC`
                      : ""}
                    {schedule.next_run_at
                      ? ` · ${t("nextRun", { time: format.dateTime(new Date(schedule.next_run_at), { dateStyle: "short", timeStyle: "short" }) })}`
                      : ` · ${t("paused")}`}
                  </span>
                  {schedule.last_status ? (
                    <span className="text-xs text-muted">{schedule.last_status}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutations.runNow.mutate(schedule.id, {
                        onSuccess: () => toast.success(t("started")),
                        onError: toastError,
                      })
                    }
                  >
                    <Play aria-hidden />
                    {t("runNow")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      mutations.update.mutate(
                        {
                          id: schedule.id,
                          body: {
                            name: schedule.name,
                            nodes: schedule.graph.nodes,
                            edges: schedule.graph.edges,
                            frequency: schedule.frequency,
                            hour_utc: schedule.hour_utc,
                            weekday: schedule.weekday,
                            source_folder_id: schedule.source_folder_id,
                            destination_folder_id: schedule.destination_folder_id,
                            enabled: !schedule.enabled,
                          },
                        },
                        { onError: toastError },
                      )
                    }
                  >
                    {schedule.enabled ? t("pause") : t("resume")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("delete")}
                    onClick={() => mutations.remove.mutate(schedule.id, { onError: toastError })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              </div>
              <button
                type="button"
                className="self-start text-sm text-primary underline"
                onClick={() => setOpen(open === schedule.id ? null : schedule.id)}
              >
                {open === schedule.id ? t("hideRuns") : t("showRuns")}
              </button>
              {open === schedule.id ? <Runs id={schedule.id} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarClock} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
