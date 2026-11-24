"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Mail, Send, User as UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Callout } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ApiError, apiJson } from "@/lib/api";

const TOPICS = ["support", "bug", "feature", "privacy", "security", "other"] as const;

export function ContactForm() {
  const t = useTranslations("contact");
  const token = useQuery({
    queryKey: ["contact-token"],
    queryFn: () => apiJson<{ token: string }>("/api/v1/contact/token"),
    staleTime: 60 * 60 * 1000,
  });
  const [values, setValues] = useState({
    name: "",
    email: "",
    topic: "support",
    message: "",
    website: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const fieldErrors: Record<string, string> =
    error?.code === "validation_error"
      ? Object.fromEntries(
          ((error.details.errors as { loc: string[]; msg: string }[]) ?? []).map((item) => [
            String(item.loc.at(-1)),
            item.msg,
          ]),
        )
      : {};

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.data) return;
    setPending(true);
    setError(null);
    try {
      const result = await apiJson<{ message: string }>("/api/v1/contact", {
        method: "POST",
        json: { ...values, token: token.data.token },
      });
      setSent(result.message);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : null);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-success/30 bg-success-subtle p-8 text-center"
        role="status"
      >
        <CircleCheck className="size-10 text-success-strong" aria-hidden />
        <p className="font-display text-lg font-semibold">{t("sent")}</p>
        <p className="text-muted">{sent}</p>
      </div>
    );
  }

  const update = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-contact-form>
      {error && error.code !== "validation_error" ? (
        <Callout tone="danger" title={error.message}>
          {error.hint}
        </Callout>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={fieldErrors.name}>
          {(props) => (
            <Input
              id={props.id}
              name="name"
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<UserIcon />}
              enterKeyHint="next"
              placeholder={t("namePlaceholder")}
              maxLength={120}
              autoComplete="name"
              required
              value={values.name}
              onChange={update("name")}
            />
          )}
        </Field>
        <Field label={t("email")} error={fieldErrors.email}>
          {(props) => (
            <Input
              id={props.id}
              name="email"
              type="email"
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<Mail />}
              dir="ltr"
              inputMode="email"
              enterKeyHint="next"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              required
              value={values.email}
              onChange={update("email")}
            />
          )}
        </Field>
      </div>
      <Field label={t("topic")}>
        {(props) => (
          <Select id={props.id} name="topic" value={values.topic} onChange={update("topic")}>
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {t(`topics.${topic}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t("message")}
        hint={t("messageHint")}
        error={fieldErrors.message}
        required
        counter={{ value: values.message.length, max: 5000 }}
      >
        {(props) => (
          <Textarea
            id={props.id}
            name="message"
            aria-describedby={props.describedBy}
            invalid={props.invalid}
            required
            minLength={10}
            maxLength={5000}
            rows={6}
            placeholder={t("messagePlaceholder")}
            value={values.message}
            onChange={update("message")}
          />
        )}
      </Field>
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">{t("website")}</label>
        <input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={update("website")}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={!token.data}
        icon={<Send />}
        mirrorIcon
        className="w-fit"
      >
        {t("send")}
      </Button>
    </form>
  );
}
