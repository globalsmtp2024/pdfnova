"use client";

import {
  Check,
  Copy,
  FileText,
  Link2,
  LogIn,
  Plus,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState } from "@/components/ui/blocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, focusFirstInvalid, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { useDeliveries, useWebhookEvents, useWebhookMutations, useWebhooks } from "@/lib/webhooks";
import { cn } from "@/lib/utils";
import { isWebUrl } from "@/lib/validate";

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
                delivery.status === "delivered"
                  ? "success"
                  : delivery.status === "failed"
                    ? "danger"
                    : "warning"
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
            {format.dateTime(new Date(delivery.created_at), {
              dateStyle: "short",
              timeStyle: "medium",
            })}
            {delivery.status !== "delivered" ? (
              <button
                type="button"
                className="text-primary underline"
                onClick={() =>
                  mutations.retry.mutate({ id, deliveryId: delivery.id }, { onError: toastError })
                }
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
  const form = useTranslations("form");
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<{ url?: string; events?: string }>({});

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
            <code
              className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs"
              dir="ltr"
              data-webhook-secret
            >
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
        noValidate
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const problems: { url?: string; events?: string } = {};
          if (!url.trim() || url.trim() === "https://") problems.url = form("required");
          else if (!isWebUrl(url, true)) problems.url = form("invalidUrl");
          if (!selected.length) problems.events = t("eventsRequired");
          setErrors(problems);
          if (problems.url || problems.events) {
            requestAnimationFrame(() => focusFirstInvalid(formRef.current));
            return;
          }
          mutations.create.mutate(
            { url: url.trim(), events: selected, description },
            {
              onSuccess: (created) => {
                setSecret(created.secret);
                setCopied(false);
                setUrl("https://");
                setDescription("");
                toast.success(t("created"));
              },
              onError: toastError,
            },
          );
        }}
      >
        <h2 className="font-display text-lg font-semibold">{t("addTitle")}</h2>
        <Field label={t("url")} required hint={t("urlHint")} error={errors.url}>
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<Link2 />}
              type="url"
              inputMode="url"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="https://example.com/hooks/pdfnova"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              dir="ltr"
              data-webhook-url
            />
          )}
        </Field>
        <Field label={t("description")} counter={{ value: description.length, max: 200 }}>
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              icon={<FileText />}
              enterKeyHint="done"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
            />
          )}
        </Field>
        <fieldset
          className="flex flex-wrap gap-x-4 gap-y-1"
          aria-describedby={errors.events ? "webhook-events-error" : undefined}
        >
          <legend className="mb-1 text-sm font-medium">{t("events")}</legend>
          {(events.data?.events ?? []).map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-invalid={errors.events ? true : undefined}
                checked={selected.includes(event)}
                onChange={(change) =>
                  setSelected(
                    change.target.checked
                      ? [...selected, event]
                      : selected.filter((entry) => entry !== event),
                  )
                }
              />
              <code dir="ltr">{event}</code>
            </label>
          ))}
          {errors.events ? (
            <p
              id="webhook-events-error"
              role="alert"
              className="w-full text-xs font-medium text-danger"
            >
              {errors.events}
            </p>
          ) : null}
        </fieldset>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          icon={<Plus />}
          loading={mutations.create.isPending}
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
            <li
              key={hook.id}
              className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-sm" dir="ltr">
                    {hook.url}
                  </span>
                  <span className="text-xs text-muted">
                    {hook.description || hook.events.join(", ")} ·{" "}
                    {t("secretEnding", { last4: hook.secret_last4 })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={hook.active ? "success" : "neutral"}>
                    {hook.active ? t("active") : t("paused")}
                  </Badge>
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
                    onClick={() =>
                      mutations.toggle.mutate(
                        { id: hook.id, active: !hook.active },
                        { onError: toastError },
                      )
                    }
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
