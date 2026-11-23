"use client";

import { FilePlus2, LogIn, PenLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/blocks";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useSignRequests } from "@/lib/esign";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<string, "success" | "danger" | "primary" | "neutral" | "warning"> = {
  completed: "success",
  declined: "danger",
  sent: "primary",
  draft: "warning",
  cancelled: "neutral",
  expired: "neutral",
};

export function EsignDashboard() {
  const t = useTranslations("esign");
  const format = useFormatter();
  const session = useSession();
  const signedIn = Boolean(session.data);
  const requests = useSignRequests(signedIn);

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
    <div className="flex flex-col gap-6" data-esign-dashboard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("subtitle")}</p>
        </div>
        <Link
          href="/dashboard/signatures/new"
          className={cn(buttonVariants({ variant: "primary" }))}
          data-esign-new
        >
          <FilePlus2 aria-hidden />
          {t("newRequest")}
        </Link>
      </div>
      {requests.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : requests.data && requests.data.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
          {requests.data.map((request) => (
            <li key={request.id}>
              <Link
                href={`/dashboard/signatures/${request.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{request.title}</span>
                  <span className="text-xs text-muted">
                    {format.dateTime(new Date(request.created_at), { dateStyle: "medium" })}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-muted">
                    {t("progress", { signed: request.signed, total: request.total })}
                  </span>
                  <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
                    {t(`status.${request.status}`)}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={PenLine}
          title={t("emptyTitle")}
          body={t("emptyBody")}
        />
      )}
    </div>
  );
}
