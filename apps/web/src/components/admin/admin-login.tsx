"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogIn, Mail, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { LogoMark } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Callout } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { ApiError, apiJson } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";

export function AdminLogin() {
  const t = useTranslations("adminPanel.login");
  const shell = useTranslations("adminPanel");
  const form = useTranslations("form");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = (result: LoginResponse) => {
    if (result.user) {
      queryClient.setQueryData(SESSION_KEY, result.user);
      router.replace("/admin");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mfaToken) {
        finish(
          await apiJson<LoginResponse>("/api/v1/auth/mfa/login", {
            method: "POST",
            json: { mfa_token: mfaToken, code: code.trim() },
          }),
        );
      } else {
        const result = await apiJson<LoginResponse>("/api/v1/admin/auth/login", {
          method: "POST",
          json: { email: email.trim(), password },
        });
        if (result.mfa_required && result.mfa_token) setMfaToken(result.mfa_token);
        else finish(result);
      }
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : form("tryAgain"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-end gap-1 px-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center p-4 outline-none"
      >
        <form
          onSubmit={submit}
          noValidate
          className="flex w-full max-w-sm flex-col gap-5 rounded-(--radius-card) border border-border bg-surface p-6 shadow-lifted"
          data-admin-login
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <LogoMark className="size-12" />
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="size-3.5" aria-hidden />
              {shell("prefix")}
            </span>
            <h1 className="font-display text-2xl font-semibold">
              {mfaToken ? t("mfaTitle") : t("title")}
            </h1>
            <p className="text-sm text-muted">{mfaToken ? t("mfaSubtitle") : t("subtitle")}</p>
          </div>
          {error ? <Callout tone="danger">{error}</Callout> : null}
          {mfaToken ? (
            <Field label={t("code")} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  icon={<KeyRound />}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  enterKeyHint="done"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              )}
            </Field>
          ) : (
            <>
              <Field label={t("email")} required>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    icon={<Mail />}
                    dir="ltr"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    enterKeyHint="next"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                )}
              </Field>
              <Field label={t("password")} required>
                {({ id, describedBy, invalid }) => (
                  <PasswordInput
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                )}
              </Field>
            </>
          )}
          <Button type="submit" variant="primary" loading={pending} icon={<LogIn />}>
            {mfaToken ? t("verify") : t("submit")}
          </Button>
          <p className="text-center text-xs text-muted">{t("notice")}</p>
        </form>
      </main>
    </div>
  );
}
