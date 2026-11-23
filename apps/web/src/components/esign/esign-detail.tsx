"use client";

import { Download, Mail, Printer, XCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { STATUS_TONE } from "@/components/esign/esign-dashboard";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/blocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import { useSignRequest, useSignRequestAction } from "@/lib/esign";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function EsignDetail({ id }: { id: string }) {
  const t = useTranslations("esign");
  const format = useFormatter();
  const session = useSession();
  const request = useSignRequest(id, Boolean(session.data));
  const resend = useSignRequestAction(id, "send");
  const cancel = useSignRequestAction(id, "cancel");

  if (session.isPending || request.isPending) return <Skeleton className="h-60 w-full" />;
  if (!request.data) {
    return (
      <p className="text-danger-strong" role="alert">
        {t("notFound")}
      </p>
    );
  }
  const data = request.data;
  const when = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" }) : "—";
  const open = data.status === "sent" || data.status === "draft";

  return (
    <div className="flex flex-col gap-6" data-esign-detail>
      <Breadcrumbs
        items={[
          { label: t("title"), href: "/dashboard/signatures" },
          { label: data.title },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">{data.title}</h1>
          <Badge tone={STATUS_TONE[data.status] ?? "neutral"}>{t(`status.${data.status}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <Button
                type="button"
                variant="outline"
                loading={resend.isPending}
                onClick={() => resend.mutate(undefined, { onError: toastError })}
              >
                <Mail aria-hidden />
                {t("sendReminders")}
              </Button>
              <Button
                type="button"
                variant="outline"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(undefined, { onError: toastError })}
              >
                <XCircle aria-hidden />
                {t("cancelRequest")}
              </Button>
            </>
          ) : null}
          <a
            className={cn(buttonVariants({ variant: data.status === "completed" ? "primary" : "outline" }))}
            href={`/api/v1/esign/requests/${data.id}/document?version=${data.status === "completed" ? "signed" : "original"}`}
          >
            <Download aria-hidden />
            {data.status === "completed" ? t("downloadSigned") : t("downloadOriginal")}
          </a>
        </div>
      </div>
      {data.message ? <p className="text-muted">{data.message}</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t("signersTitle")}</h2>
        <ul className="divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
          {data.recipients.map((recipient) => (
            <li key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="flex flex-col">
                <span className="font-medium">{recipient.name}</span>
                <span className="text-xs text-muted" dir="ltr">
                  {recipient.email}
                </span>
                {recipient.decline_reason ? (
                  <span className="text-xs text-danger-strong">{recipient.decline_reason}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-muted">
                  {recipient.signed_at ? when(recipient.signed_at) : recipient.viewed_at ? t("viewedAt", { time: when(recipient.viewed_at) }) : ""}
                </span>
                <Badge tone={recipient.status === "signed" ? "success" : recipient.status === "declined" ? "danger" : "neutral"}>
                  {t(`recipient.${recipient.status}`)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-5 print:border-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{t("certificateTitle")}</h2>
          <Button type="button" variant="ghost" size="sm" className="print:hidden" onClick={() => window.print()}>
            <Printer aria-hidden />
            {t("print")}
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t("requestId")}</dt>
          <dd className="font-mono text-xs break-all" dir="ltr">{data.id}</dd>
          <dt className="text-muted">{t("originalHash")}</dt>
          <dd className="font-mono text-xs break-all" dir="ltr">{data.original_sha256}</dd>
          {data.signed_sha256 ? (
            <>
              <dt className="text-muted">{t("signedHash")}</dt>
              <dd className="font-mono text-xs break-all" dir="ltr">{data.signed_sha256}</dd>
            </>
          ) : null}
          <dt className="text-muted">{t("completedAt")}</dt>
          <dd>{when(data.completed_at)}</dd>
        </dl>
        <h3 className="mt-2 font-medium">{t("auditTrail")}</h3>
        <ol className="flex flex-col gap-1 text-sm">
          {data.events.map((event, index) => (
            <li key={index} className="flex flex-wrap gap-x-3">
              <span className="text-muted tabular-nums">{when(event.at)}</span>
              <span>{t(`event.${event.event}`)}</span>
              {event.recipient_name ? <span className="text-muted">{event.recipient_name}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
