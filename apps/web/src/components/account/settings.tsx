"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Database,
  LogIn,
  Monitor,
  ShieldCheck,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Panel } from "@/components/account/dashboard";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeSelect } from "@/components/layout/theme-toggle";
import { Callout, EmptyState } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toaster";
import { Link, useRouter } from "@/i18n/navigation";
import { useSessions, useUpdateProfile } from "@/lib/account";
import { apiFetch, apiJson } from "@/lib/api";
import { SESSION_KEY, useSession } from "@/lib/session";
import type { User } from "@/lib/types";

function ProfileSection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const update = useUpdateProfile();
  const [name, setName] = useState(user.display_name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { display_name: name },
      { onSuccess: () => toast.success(t("saved")), onError: toastError },
    );
  };
  return (
    <Panel title={t("profile")} icon={UserIcon}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t("displayName")}>
          {(props) => (
            <Input
              id={props.id}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label={t("email")}>
          {(props) => <Input id={props.id} value={user.email} readOnly disabled />}
        </Field>
        <Button type="submit" variant="solid" loading={update.isPending} className="w-fit">
          {t("save")}
        </Button>
      </form>
    </Panel>
  );
}

function PreferencesSection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const update = useUpdateProfile();
  return (
    <Panel title={t("preferences")} icon={SlidersHorizontal}>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-(--primary)"
          checked={user.retention_extended}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { retention_extended: event.target.checked },
              { onSuccess: () => toast.success(t("saved")), onError: toastError },
            )
          }
          data-retention-toggle
        />
        <span>
          <span className="block text-sm font-medium">{t("retention")}</span>
          <span className="block text-xs text-muted">{t("retentionHint")}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{t("language")}</span>
        <LanguageSwitcher />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{t("theme")}</span>
        <ThemeSelect />
      </div>
    </Panel>
  );
}

function TwoFactor({ user }: { user: User }) {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const begin = useMutation({
    mutationFn: () =>
      apiJson<{ secret: string; otpauth_uri: string }>("/api/v1/auth/mfa/setup", {
        method: "POST",
      }),
    onSuccess: setSetup,
    onError: toastError,
  });
  const enable = useMutation({
    mutationFn: () =>
      apiJson<{ recovery_codes: string[] }>("/api/v1/auth/mfa/enable", {
        method: "POST",
        json: { code },
      }),
    onSuccess: (result) => {
      setCodes(result.recovery_codes);
      setSetup(null);
      setCode("");
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: toastError,
  });
  const disable = useMutation({
    mutationFn: () =>
      apiJson<User>("/api/v1/auth/mfa/disable", { method: "POST", json: { password, code } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(SESSION_KEY, updated);
      setCode("");
      setPassword("");
    },
    onError: toastError,
  });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{t("twoFactor")}</p>
        <p className="text-sm text-muted">
          {user.totp_enabled ? t("twoFactorOn") : t("twoFactorOff")}
        </p>
      </div>
      {codes ? (
        <Callout tone="warning" title={t("recoveryCodes")}>
          <p>{t("recoveryHint")}</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs" dir="ltr">
            {codes.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      {!user.totp_enabled && !setup ? (
        <Button
          variant="outline"
          className="w-fit"
          loading={begin.isPending}
          onClick={() => begin.mutate()}
        >
          {t("enable")}
        </Button>
      ) : null}
      {setup ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            enable.mutate();
          }}
        >
          <p className="text-sm text-muted">{t("scanCode")}</p>
          <code
            className="w-fit rounded-md bg-surface-muted px-2 py-1 font-mono text-sm break-all"
            dir="ltr"
          >
            {setup.secret}
          </code>
          <Field label={t("verificationCode")}>
            {(props) => (
              <Input
                id={props.id}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="solid"
            className="w-fit"
            loading={enable.isPending}
            disabled={code.trim().length < 6}
          >
            {t("enable")}
          </Button>
        </form>
      ) : null}
      {user.totp_enabled ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            disable.mutate();
          }}
        >
          {user.has_password ? (
            <Field label={t("currentPassword")}>
              {(props) => (
                <Input
                  id={props.id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Field label={t("verificationCode")}>
            {(props) => (
              <Input
                id={props.id}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="outline" loading={disable.isPending}>
            {t("disable")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function PasswordForm({ user }: { user: User }) {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () =>
      apiJson<{ user: User }>("/api/v1/auth/password/change", {
        method: "POST",
        json: { current_password: current, new_password: next },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(SESSION_KEY, result.user);
      setCurrent("");
      setNext("");
      toast.success(t("saved"));
    },
    onError: toastError,
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        change.mutate();
      }}
    >
      {user.has_password ? (
        <Field label={t("currentPassword")}>
          {(props) => (
            <Input
              id={props.id}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          )}
        </Field>
      ) : null}
      <Field label={t("newPassword")}>
        {(props) => (
          <Input
            id={props.id}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="outline"
        loading={change.isPending}
        disabled={next.length < 10}
      >
        {t("changePassword")}
      </Button>
    </form>
  );
}

function Sessions() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const sessions = useSessions(true);
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    onError: toastError,
  });
  if (sessions.isPending) return <Skeleton className="h-20" />;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">{t("sessions")}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {sessions.data?.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 p-3">
            <Monitor className="size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{entry.user_agent || "Unknown device"}</p>
              <p className="text-xs text-muted">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(entry.last_active_at))}
              </p>
            </div>
            {entry.current ? (
              <span className="text-xs font-medium text-success-strong">{t("thisDevice")}</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(entry.id)}>
                {t("signOutSession")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiKeySection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const providers = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => apiJson<{ providers: string[] }>("/api/v1/me/ai-providers"),
  });
  const [provider, setProvider] = useState(user.ai_key?.provider ?? "anthropic");
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: () =>
      apiJson<User>("/api/v1/me/ai-key", { method: "PUT", json: { provider, api_key: key } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(SESSION_KEY, updated);
      setKey("");
      toast.success(t("saved"));
    },
    onError: toastError,
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const test = useMutation({
    mutationFn: () =>
      apiJson<{ ok: boolean; message: string }>("/api/v1/me/ai-key/test", {
        method: "POST",
        json: key.trim() ? { provider, api_key: key } : { provider: user.ai_key?.provider },
      }),
    onSuccess: setTestResult,
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => apiJson<User>("/api/v1/me/ai-key", { method: "DELETE" }),
    onSuccess: (updated) => queryClient.setQueryData(SESSION_KEY, updated),
    onError: toastError,
  });
  return (
    <Panel title={t("ai")} icon={Bot}>
      <p className="text-sm text-muted">{t("aiHint")}</p>
      {user.ai_key ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="text-sm">
            {t("aiSaved", { provider: user.ai_key.provider, last4: user.ai_key.last4 })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t("remove")}
          </Button>
        </div>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("aiProvider")}>
          {(props) => (
            <select
              id={props.id}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="h-11 rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm"
            >
              {(providers.data?.providers ?? ["anthropic"]).map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("aiKey")}>
          {(props) => (
            <Input
              id={props.id}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          )}
        </Field>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            loading={test.isPending}
            disabled={!key.trim() && !user.ai_key}
            onClick={() => {
              setTestResult(null);
              test.mutate();
            }}
            data-ai-key-test
          >
            {t("aiTest")}
          </Button>
          <Button
            type="submit"
            variant="solid"
            loading={save.isPending}
            disabled={key.trim().length < 16}
          >
            {t("save")}
          </Button>
        </div>
      </form>
      {testResult ? (
        <p
          role="status"
          className={testResult.ok ? "text-sm text-success-strong" : "text-sm text-danger-strong"}
        >
          {testResult.ok ? t("aiTestOk") : t("aiTestFailed", { reason: testResult.message })}
        </p>
      ) : null}
    </Panel>
  );
}

function DataSection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const remove = useMutation({
    mutationFn: () =>
      apiJson<{ message: string }>("/api/v1/me/delete", {
        method: "POST",
        json: { password, confirm_email: email },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(SESSION_KEY, null);
      toast.success(result.message);
      router.push("/");
    },
    onError: toastError,
  });
  return (
    <Panel title={t("data")} icon={Database}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("exportHint")}</p>
        <Button asChild variant="outline">
          <a href="/api/v1/me/export" download>
            {t("export")}
          </a>
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-danger/30 p-4">
        <p className="font-medium text-danger-strong">{t("deleteAccount")}</p>
        <p className="text-sm text-muted">{t("deleteHint")}</p>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            remove.mutate();
          }}
        >
          {user.has_password ? (
            <Field label={t("currentPassword")}>
              {(props) => (
                <Input
                  id={props.id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
          ) : (
            <Field label={t("confirmEmail")}>
              {(props) => (
                <Input
                  id={props.id}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
          )}
          <Button
            type="submit"
            variant="danger"
            loading={remove.isPending}
            disabled={user.has_password ? !password : email.trim().toLowerCase() !== user.email}
          >
            {t("deleteConfirm")}
          </Button>
        </form>
      </div>
    </Panel>
  );
}

export function Settings() {
  const t = useTranslations();
  const session = useSession();
  if (session.isPending) return <Skeleton className="h-96" />;
  if (!session.data) {
    return (
      <EmptyState
        icon={LogIn}
        titleAs="h1"
        title={t("dashboard.signInRequired")}
        body={t("dashboard.signInBody")}
        action={
          <Button asChild variant="primary">
            <Link href="/auth/login?next=/settings">{t("common.signIn")}</Link>
          </Button>
        }
      />
    );
  }
  const user = session.data;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-bold tracking-tight">{t("settings.title")}</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection key={user.id} user={user} />
        <PreferencesSection user={user} />
        <Panel title={t("settings.security")} icon={ShieldCheck} className="lg:col-span-2">
          <TwoFactor user={user} />
          <div className="border-t border-border pt-4">
            <p className="mb-2 font-medium">{t("settings.password")}</p>
            <PasswordForm user={user} />
          </div>
          <div className="border-t border-border pt-4">
            <Sessions />
          </div>
        </Panel>
        <AiKeySection user={user} />
        <DataSection user={user} />
      </div>
    </div>
  );
}
