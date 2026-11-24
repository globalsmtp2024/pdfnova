"use client";

import {
  CalendarDays,
  CheckSquare,
  PenLine,
  Plus,
  Signature,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { FieldPlacer, type PlacedBox } from "@/components/tools/field-placer";
import { usePdfDocument } from "@/components/tools/pdf-page-canvas";
import { Callout } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/components/ui/toaster";
import { newId } from "@/lib/editor-ops";
import { asLocalFile, useCreateSignRequest } from "@/lib/esign";
import { cn } from "@/lib/utils";

type SignKind = "signature" | "initials" | "date" | "text" | "checkbox";
type SignField = PlacedBox & {
  kind: SignKind;
  recipient: number;
  required: boolean;
  label: string;
};
type Signer = { name: string; email: string };

const PALETTE = ["#5B4BFF", "#E5484D", "#12A594", "#F5A524", "#8E4EC6", "#0091FF"];
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS: { id: SignKind; icon: typeof Type }[] = [
  { id: "signature", icon: Signature },
  { id: "initials", icon: PenLine },
  { id: "date", icon: CalendarDays },
  { id: "text", icon: TextCursorInput },
  { id: "checkbox", icon: CheckSquare },
];
const SIZES: Record<SignKind, { width: number; height: number }> = {
  signature: { width: 26, height: 7 },
  initials: { width: 12, height: 6 },
  date: { width: 16, height: 3.6 },
  text: { width: 28, height: 3.6 },
  checkbox: { width: 2.8, height: 2.2 },
};

export function EsignNew() {
  const t = useTranslations("esign");
  const router = useRouter();
  const create = useCreateSignRequest();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(14);
  const [signers, setSigners] = useState<Signer[]>([{ name: "", email: "" }]);
  const [fields, setFields] = useState<SignField[]>([]);
  const [kind, setKind] = useState<SignKind>("signature");
  const [active, setActive] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  const local = useMemo(() => (file ? asLocalFile(file) : undefined), [file]);
  const { document, failed } = usePdfDocument(local);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_PDF_BYTES || !chosen.name.toLowerCase().endsWith(".pdf")) {
      setFileError(true);
      return;
    }
    setFileError(false);
    setFile(chosen);
    setFields([]);
    if (!title) setTitle(chosen.name.replace(/\.pdf$/i, ""));
  };

  const signersValid =
    signers.length > 0 &&
    signers.every((signer) => signer.name.trim() && EMAIL.test(signer.email.trim())) &&
    new Set(signers.map((signer) => signer.email.trim().toLowerCase())).size === signers.length;
  const everyoneHasField = signers.every((_, index) =>
    fields.some((field) => field.recipient === index),
  );
  const selected = fields.find((field) => field.id === selectedId) ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    try {
      const result = await create.mutateAsync({
        file,
        metadata: {
          title,
          message,
          expires_days: days,
          recipients: signers.map((signer) => ({
            name: signer.name.trim(),
            email: signer.email.trim(),
          })),
          fields: fields.map((field) => ({
            recipient: field.recipient,
            kind: field.kind,
            page: field.page,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            required: field.required,
            label: field.label,
          })),
          send: true,
        },
      });
      router.push(`/dashboard/signatures/${result.id}`);
    } catch (error) {
      toastError(error);
    }
  };

  const steps = ["document", "signers", "fields", "review"] as const;

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} data-esign-new-form>
      <div>
        <h1 className="font-display text-3xl font-semibold">{t("newTitle")}</h1>
        <ol className="mt-3 flex flex-wrap gap-2 text-sm" aria-label={t("steps")}>
          {steps.map((name, index) => (
            <li
              key={name}
              aria-current={step === index + 1 ? "step" : undefined}
              className={cn(
                "rounded-full px-3 py-1",
                step === index + 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-muted text-muted",
              )}
            >
              {index + 1}. {t(`step.${name}`)}
            </li>
          ))}
        </ol>
      </div>

      {step === 1 ? (
        <section className="flex max-w-xl flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("pdfFile")}
            <Input type="file" accept="application/pdf,.pdf" onChange={onFile} data-esign-file />
          </label>
          {fileError ? (
            <p className="text-sm text-danger-strong" role="alert">
              {t("fileRejected")}
            </p>
          ) : null}
          {file ? <p className="text-sm text-muted">{file.name}</p> : null}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("documentTitle")}
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("messageLabel")}
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border border-border bg-surface p-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("expiresIn")}
            <Input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(event) =>
                setDays(Math.min(Math.max(Number(event.target.value) || 14, 1), 60))
              }
            />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex max-w-xl flex-col gap-3">
          {signers.map((signer, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <span
                className="mb-2 size-3 rounded-full"
                style={{ background: PALETTE[index % PALETTE.length] }}
                aria-hidden
              />
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
                {t("signerName")}
                <Input
                  value={signer.name}
                  onChange={(event) =>
                    setSigners(
                      signers.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                  data-esign-signer-name
                />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
                {t("signerEmail")}
                <Input
                  type="email"
                  value={signer.email}
                  onChange={(event) =>
                    setSigners(
                      signers.map((entry, i) =>
                        i === index ? { ...entry, email: event.target.value } : entry,
                      ),
                    )
                  }
                  data-esign-signer-email
                />
              </label>
              {signers.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("removeSigner")}
                  onClick={() => {
                    setSigners(signers.filter((_, i) => i !== index));
                    setFields(
                      fields
                        .filter((field) => field.recipient !== index)
                        .map((field) =>
                          field.recipient > index
                            ? { ...field, recipient: field.recipient - 1 }
                            : field,
                        ),
                    );
                    setActive(0);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          {signers.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setSigners([...signers, { name: "", email: "" }])}
            >
              <Plus aria-hidden />
              {t("addSigner")}
            </Button>
          ) : null}
          {!signersValid && signers.some((signer) => signer.name || signer.email) ? (
            <p className="text-sm text-warning-strong">{t("signersProblem")}</p>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {failed ? (
            <p className="text-sm text-danger-strong" role="alert">
              {t("loadFailed")}
            </p>
          ) : (
            <FieldPlacer
              document={document}
              pageCount={document?.numPages ?? 1}
              fields={fields}
              onChange={setFields}
              placing={kind}
              create={(placed, page, box) => ({
                id: newId(),
                page,
                kind: placed as SignKind,
                recipient: active,
                required: true,
                label: "",
                ...box,
              })}
              defaultSize={(placed) => SIZES[placed as SignKind]}
              selectedId={selectedId}
              onSelect={setSelectedId}
              colorFor={(field) => PALETTE[field.recipient % PALETTE.length]}
              renderLabel={(field) => (
                <span className="truncate">
                  {t(`field.${field.kind}`)} ·{" "}
                  {signers[field.recipient]?.name || field.recipient + 1}
                </span>
              )}
            />
          )}
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t("assignTo")}</legend>
              {signers.map((signer, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={active === index}
                  onClick={() => setActive(index)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm",
                    active === index ? "border-primary bg-primary-subtle" : "border-border",
                  )}
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ background: PALETTE[index % PALETTE.length] }}
                  />
                  {signer.name || signer.email || index + 1}
                </button>
              ))}
            </fieldset>
            <div className="grid grid-cols-5 gap-1.5" role="toolbar" aria-label={t("fieldTypes")}>
              {KINDS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={kind === id}
                  title={t(`field.${id}`)}
                  aria-label={t(`field.${id}`)}
                  data-esign-kind={id}
                  onClick={() => setKind(id)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border",
                    kind === id
                      ? "border-primary bg-primary-subtle"
                      : "border-border hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{t("placeHint")}</p>
            {selected ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.required}
                    onChange={(event) =>
                      setFields(
                        fields.map((field) =>
                          field.id === selected.id
                            ? { ...field, required: event.target.checked }
                            : field,
                        ),
                      )
                    }
                  />
                  {t("required")}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFields(fields.filter((field) => field.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  <Trash2 aria-hidden />
                  {t("deleteField")}
                </Button>
              </div>
            ) : null}
            {!everyoneHasField ? (
              <p className="text-sm text-warning-strong">{t("fieldsProblem")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="flex max-w-xl flex-col gap-3">
          <Callout tone="info">{t("reviewNote")}</Callout>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t("documentTitle")}</dt>
            <dd>{title}</dd>
            <dt className="text-muted">{t("pdfFile")}</dt>
            <dd>{file?.name}</dd>
            <dt className="text-muted">{t("step.signers")}</dt>
            <dd>
              <ul>
                {signers.map((signer) => (
                  <li key={signer.email}>
                    {signer.name} &lt;{signer.email}&gt;
                  </li>
                ))}
              </ul>
            </dd>
            <dt className="text-muted">{t("step.fields")}</dt>
            <dd>{t("fieldCount", { count: fields.length })}</dd>
            <dt className="text-muted">{t("expiresIn")}</dt>
            <dd>{t("days", { count: days })}</dd>
          </dl>
        </section>
      ) : null}

      <div className="flex gap-2">
        {step > 1 ? (
          <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
            {t("back")}
          </Button>
        ) : null}
        {step < 4 ? (
          <Button
            type="button"
            variant="primary"
            data-esign-next
            disabled={
              (step === 1 && (!file || !title.trim())) ||
              (step === 2 && !signersValid) ||
              (step === 3 && !everyoneHasField)
            }
            onClick={() => setStep(step + 1)}
          >
            {t("next")}
          </Button>
        ) : (
          <Button type="submit" variant="primary" loading={create.isPending} data-esign-send>
            {t("sendRequest")}
          </Button>
        )}
      </div>
    </form>
  );
}
