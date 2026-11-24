"use client";

import { Check, CircleX, PenLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useRef, useState, type PointerEvent } from "react";

import { usePdfDocument, PdfPageCanvas } from "@/components/tools/pdf-page-canvas";
import { Callout } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import {
  asLocalFile,
  useDeclineSignature,
  useSignerDocument,
  useSignerView,
  useSubmitSignature,
  type SignFieldInfo,
} from "@/lib/esign";
import { cn } from "@/lib/utils";

const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;

function SignaturePad({
  kind,
  onDone,
  onCancel,
}: {
  kind: "signature" | "initials";
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("esign");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * PAD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * PAD_HEIGHT,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0B1B6B";
    const origin = point(event);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
    setDrawn(true);
  };
  const stop = () => {
    drawing.current = false;
  };

  const apply = () => {
    const target = canvas.current;
    if (!target) return;
    if (mode === "type") {
      const context = target.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
      context.fillStyle = "#0B1B6B";
      context.font = `italic ${kind === "initials" ? 72 : 64}px "Noto Serif", Georgia, serif`;
      context.textBaseline = "middle";
      context.fillText(typed, 16, PAD_HEIGHT / 2, PAD_WIDTH - 32);
    }
    onDone(target.toDataURL("image/png"));
  };

  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    setDrawn(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-label={t("padTitle")}
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-(--radius-card) bg-surface p-5 shadow-lifted">
        <h2 className="font-display text-lg font-semibold">
          {kind === "initials" ? t("padInitials") : t("padTitle")}
        </h2>
        <div className="flex gap-2">
          {(["draw", "type"] as const).map((entry) => (
            <Button
              key={entry}
              type="button"
              size="sm"
              variant={mode === entry ? "solid" : "outline"}
              onClick={() => setMode(entry)}
            >
              {t(`pad.${entry}`)}
            </Button>
          ))}
        </div>
        {mode === "type" ? (
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("typeHere")}
            aria-label={t("typeHere")}
            maxLength={120}
            enterKeyHint="done"
            autoFocus
            data-esign-typed
          />
        ) : null}
        <canvas
          ref={canvas}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          className={cn(
            "w-full touch-none rounded-lg border border-border bg-white",
            mode === "type" && "hidden",
          )}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          data-esign-pad
        />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={mode === "draw" ? clear : onCancel}>
            {mode === "draw" ? t("clear") : t("cancel")}
          </Button>
          <span className="flex gap-2">
            {mode === "draw" ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {t("cancel")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              disabled={mode === "draw" ? !drawn : !typed.trim()}
              onClick={apply}
              data-esign-pad-apply
            >
              {t("useSignature")}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function EsignSign({ token }: { token: string }) {
  const t = useTranslations("esign");
  const format = useFormatter();
  const view = useSignerView(token);
  const documentQuery = useSignerDocument(token, Boolean(view.data));
  const local = useMemo(
    () => (documentQuery.data ? asLocalFile(documentQuery.data) : undefined),
    [documentQuery.data],
  );
  const { document } = usePdfDocument(local);
  const submit = useSubmitSignature(token);
  const decline = useDeclineSignature(token);
  const [values, setValues] = useState<Record<string, string>>({});
  const [padFor, setPadFor] = useState<SignFieldInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<"signed" | "declined" | null>(null);

  if (view.isPending) return <Skeleton className="h-60 w-full" />;
  if (view.isError || !view.data) {
    return (
      <Callout tone="danger" title={t("linkProblemTitle")}>
        {view.error instanceof Error ? view.error.message : t("linkProblem")}
      </Callout>
    );
  }
  if (outcome) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" data-esign-done>
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            outcome === "signed" ? "bg-success-subtle text-success-strong" : "bg-surface-muted",
          )}
        >
          {outcome === "signed" ? (
            <Check className="size-7" aria-hidden />
          ) : (
            <CircleX className="size-7" aria-hidden />
          )}
        </span>
        <h1 className="font-display text-2xl font-semibold">
          {outcome === "signed" ? t("signedTitle") : t("declinedTitle")}
        </h1>
        <p className="max-w-md text-muted">
          {outcome === "signed" ? t("signedBody") : t("declinedBody")}
        </p>
      </div>
    );
  }

  const data = view.data;
  const pageFields = data.fields.filter((field) => field.page === pageIndex + 1);
  const missing = data.fields.some((field) => {
    if (!field.required || field.kind === "date") return false;
    const value = values[field.id];
    return field.kind === "checkbox" ? value !== "true" : !value;
  });

  const activate = (field: SignFieldInfo) => {
    if (field.kind === "signature" || field.kind === "initials") {
      setPadFor(field);
      return;
    }
    if (field.kind === "checkbox") {
      setValues({ ...values, [field.id]: values[field.id] === "true" ? "false" : "true" });
      return;
    }
    if (field.kind === "text") {
      const next = window.prompt(field.label || t("field.text"), values[field.id] ?? "");
      if (next !== null) setValues({ ...values, [field.id]: next });
    }
  };

  const finish = () =>
    submit.mutate(values, { onSuccess: () => setOutcome("signed"), onError: toastError });

  return (
    <div className="flex flex-col gap-5" data-esign-sign>
      <div>
        <h1 className="font-display text-3xl font-semibold">{data.title}</h1>
        <p className="text-muted">
          {t("fromSender", { sender: data.sender })} ·{" "}
          {t("expiresOn", {
            date: format.dateTime(new Date(data.expires_at), { dateStyle: "medium" }),
          })}
        </p>
        {data.message ? <p className="mt-2">{data.message}</p> : null}
      </div>
      <Callout tone="info">{t("signerHelp", { name: data.signer_name })}</Callout>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex(pageIndex - 1)}
        >
          {t("previous")}
        </Button>
        <span className="text-sm">
          {t("pageOf", { page: pageIndex + 1, count: data.page_count })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pageIndex + 1 >= data.page_count}
          onClick={() => setPageIndex(pageIndex + 1)}
        >
          {t("next")}
        </Button>
      </div>

      <PdfPageCanvas document={document} pageIndex={pageIndex}>
        {(pageView) => (
          <div className="absolute inset-0">
            {pageFields.map((field) => {
              const value = values[field.id];
              const filled = field.kind === "date" || Boolean(value && value !== "false");
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => activate(field)}
                  data-esign-field={field.kind}
                  aria-label={t(`field.${field.kind}`)}
                  className={cn(
                    "absolute flex items-center justify-center overflow-hidden border-2 text-xs font-medium",
                    filled
                      ? "border-success bg-success/10 text-success-strong"
                      : "border-primary bg-primary/10 text-primary",
                  )}
                  style={{
                    left: (field.x / 100) * pageView.width,
                    top: (field.y / 100) * pageView.height,
                    width: (field.width / 100) * pageView.width,
                    height: (field.height / 100) * pageView.height,
                  }}
                >
                  {(field.kind === "signature" || field.kind === "initials") && value ? (
                    <img src={value} alt="" className="size-full object-contain" />
                  ) : field.kind === "text" && value ? (
                    <span className="truncate px-1 text-foreground">{value}</span>
                  ) : field.kind === "date" ? (
                    <span>{t("autoDate")}</span>
                  ) : field.kind === "checkbox" ? (
                    value === "true" ? (
                      <Check className="size-3" aria-hidden />
                    ) : null
                  ) : (
                    <span className="flex items-center gap-1">
                      <PenLine className="size-3" aria-hidden />
                      {t(`field.${field.kind}`)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </PdfPageCanvas>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1"
          data-esign-consent
        />
        {t("consent")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!consent || missing}
          loading={submit.isPending}
          onClick={finish}
          data-esign-finish
        >
          {t("finish")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setDeclining(true)}>
          {t("decline")}
        </Button>
        {missing ? (
          <span className="self-center text-sm text-muted">{t("completeFields")}</span>
        ) : null}
      </div>

      {declining ? (
        <div className="flex max-w-lg flex-col gap-2 rounded-xl border border-border p-4">
          <label className="text-sm font-medium" htmlFor="esign-reason">
            {t("declineReason")}
          </label>
          <Textarea
            id="esign-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder={t("declinePlaceholder")}
          />
          <p className="text-end text-xs text-muted tabular-nums" aria-hidden>
            {reason.length}/500
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              loading={decline.isPending}
              onClick={() =>
                decline.mutate(reason, {
                  onSuccess: () => setOutcome("declined"),
                  onError: toastError,
                })
              }
            >
              {t("confirmDecline")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {padFor ? (
        <SignaturePad
          kind={padFor.kind === "initials" ? "initials" : "signature"}
          onCancel={() => setPadFor(null)}
          onDone={(dataUrl) => {
            const targets = data.fields.filter((field) => field.kind === padFor.kind);
            const next = { ...values };
            for (const field of targets) next[field.id] = dataUrl;
            setValues(next);
            setPadFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
