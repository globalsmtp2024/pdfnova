"use client";

import { Eye, EyeOff, LockKeyhole, LockKeyholeOpen, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

export function PasswordPrompt({
  file,
  onUnlock,
}: {
  file: LocalFile;
  onUnlock: (password: string) => Promise<void>;
}) {
  const t = useTranslations("password");
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `password-${file.key}`;

  if (file.unlocked) {
    return (
      <p className="mt-3 flex items-center gap-1.5 ps-9 text-xs text-success-strong" data-unlocked>
        <LockKeyholeOpen className="size-3.5" aria-hidden />
        {t("unlocked")}
      </p>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(value);
      setValue("");
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === "PDF_ENCRYPTED" ? t("wrong") : t("failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-1.5 ps-9" data-password-prompt>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-medium text-warning-strong"
      >
        <LockKeyhole className="size-3.5" aria-hidden />
        {t("needed")}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="off"
            className="h-9 pe-9"
            value={value}
            aria-invalid={error !== null}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? t("hide") : t("show")}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <Button
          icon={<LockOpen />}
          type="submit"
          size="sm"
          variant="solid"
          loading={busy}
          disabled={!value}
        >
          {t("unlock")}
        </Button>
      </div>
      <p
        className={error ? "text-xs text-danger-strong" : "text-xs text-muted"}
        role={error ? "alert" : undefined}
      >
        {error ?? t("privacy")}
      </p>
    </form>
  );
}
