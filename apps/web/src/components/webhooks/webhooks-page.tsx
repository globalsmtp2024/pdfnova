"use client";

import { Check, Copy, LogIn, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState } from "@/components/ui/blocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import {
  useDeliveries,
  useWebhookEvents,
  useWebhookMutations,
  useWebhooks,
} from "@/lib/webhooks";
import { cn } from "@/lib/utils";

function DeliveryLog({ id }: { id: string }) {
  const t = useTranslations("webhooks");
  const format = useFormatter();
  const deliveries = useDeliveries(id);
  const mutations = useWebhookMutations();
  if (deliveries.isPending) return <Skeleton className="h-16 w-full" />;
  if (!deliveries.data?.length) return <p className="text-sm text-muted">{t("noDeliveries")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
      {deliveries.data.map((delivery) => (
        <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs" dir="ltr">
              {delivery.event}
            </code>
            <Badge
              tone={
                delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "danger" : "warning"
              }
            >
              {t(`status.${delivery.status}`)}
            </Badge>
            <span className="text-xs text-muted">
              {t("attempts", { count: delivery.attempts })}
              {delivery.last_status_code ? ` · ${delivery.last_status_code}` : ""}
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {delivery.last_error ?? ""}
            {format.dateTime(new Date(delivery.created_at), { dateStyle: "short", timeStyle: "medium" })}
            {delivery.status !== "delivered" ? (
              <button
                type="button"
                className="text-primary underline"
                onClick={() => mutations.retry.mutate({ id, deliveryId: delivery.id }, { onError: toastError })}
              >
                {t("retry")}
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WebhooksPage() {
  const t = useTranslations("webhooks");
  const session = useSession();
  const hooks = useWebhooks(Boolean(session.data));
  const events = useWebhookEvents();
  const mutations = useWebhookMutations();
  const [url, setUrl] = useState("https://");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>(["task.succeeded", "task.failed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="flex flex-col gap-8" data-webhooks>
      {secret ? (
        <Callout tone="warning" title={t("secretTitle")}>
          <p className="text-sm">{t("secretBody")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs" dir="ltr" data-webhook-secret>
              {secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        </Callout>
      ) : null}

      <form
        className="flex max-w-2xl flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutations.create.mutate(
            { url: url.trim(), events: selected, description },
            {
              onSuccess: (created) => {
                setSecret(created.secret);
                setCopied(false);
                setUrl("https://");
                setDescription("");
              },
              onError: toastError,
            },
          );
        }}
      >
        <h2 className="font-display text-lg font-semibold">{t("addTitle")}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("url")}
          <Input value={url} onChange={(event) => setUrl(event.target.value)} dir="ltr" data-webhook-url />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("description")}
          <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="mb-1 text-sm font-medium">{t("events")}</legend>
          {(events.data?.events ?? []).map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(event)}
                onChange={(change) =>
                  setSelected(
                    change.target.checked ? [...selected, event] : selected.filter((entry) => entry !== event),
                  )
                }
              />
              <code dir="ltr">{event}</code>
            </label>
          ))}
        </fieldset>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          loading={mutations.create.isPending}
          disabled={!selected.length}
          data-webhook-create
        >
          {t("add")}
        </Button>
      </form>

      {hooks.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : hooks.data && hooks.data.length ? (
        <ul className="flex flex-col gap-4">
          {hooks.data.map((hook) => (
            <li key={hook.id} className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-sm" dir="ltr">
                    {hook.url}
                  </span>
                  <span className="text-xs text-muted">
                    {hook.description || hook.events.join(", ")} · {t("secretEnding", { last4: hook.secret_last4 })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={hook.active ? "success" : "neutral"}>{hook.active ? t("active") : t("paused")}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutations.test.mutate(hook.id, {
                        onSuccess: () => toast.success(t("testQueued")),
                        onError: toastError,
                      })
                    }
                  >
                    <Send aria-hidden />
                    {t("test")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => mutations.toggle.mutate({ id: hook.id, active: !hook.active }, { onError: toastError })}
                  >
                    {hook.active ? t("pause") : t("resume")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("delete")}
                    onClick={() => mutations.remove.mutate(hook.id, { onError: toastError })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              </div>
              <button
                type="button"
                className="self-start text-sm text-primary underline"
                onClick={() => setOpen(open === hook.id ? null : hook.id)}
              >
                {open === hook.id ? t("hideLog") : t("showLog")}
              </button>
              {open === hook.id ? <DeliveryLog id={hook.id} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={WebhookIcon} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
