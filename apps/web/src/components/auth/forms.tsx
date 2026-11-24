"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleCheck,
  KeyRound,
  LogIn,
  Mail,
  RotateCcw,
  Send,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";

import { AuthCard, OAuthButtons } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, focusFirstInvalid, Input, PasswordInput } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, apiJson } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";
import type { LoginResponse, User } from "@/lib/types";

type FieldErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 10;

function useSubmit() {
  const t = useTranslations("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(0, {
              code: "unknown",
              message: t("tryAgain"),
              hint: null,
              details: {},
            }),
      );
      return null;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

function useClientErrors(form: RefObject<HTMLFormElement | null>) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const show = (next: FieldErrors): boolean => {
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => focusFirstInvalid(form.current));
      return false;
    }
    return true;
  };
  return { errors, show };
}

function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm"
    >
      <p className="font-medium text-danger">{error.message}</p>
      {error.hint ? <p className="mt-0.5 text-muted">{error.hint}</p> : null}
    </div>
  );
}

function fieldErrorsFrom(error: ApiError | null): FieldErrors {
  if (!error || error.code !== "validation_error") return {};
  const errors = (error.details.errors as { loc: string[]; msg: string }[] | undefined) ?? [];
  return Object.fromEntries(
    errors.map((item) => [String(item.loc.at(-1)), item.msg.replace(/^Value error, /, "")]),
  );
}

function useAfterLogin(defaultPath = "/") {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  return (user: User) => {
    queryClient.setQueryData(SESSION_KEY, user);
    const next = params.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : defaultPath);
  };
}

function MfaStep({ token, onBack }: { token: string; onBack?: () => void }) {
  const t = useTranslations("auth.mfa");
  const form = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState("");
  const { pending, error, run } = useSubmit();
  const client = useClientErrors(form);
  const afterLogin = useAfterLogin();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!client.show(trimmed.length < 6 ? { code: t("short") } : {})) return;
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/mfa/login", {
        method: "POST",
        json: { mfa_token: token, code: trimmed },
      }),
    );
    if (result?.user) afterLogin(result.user);
  };
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form ref={form} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <FormError error={error} />
        <Field label={t("codeLabel")} required hint={t("codeHint")} error={client.errors.code}>
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<ShieldCheck />}
              dir="ltr"
              inputMode="text"
              enterKeyHint="done"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              maxLength={24}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending} icon={<ShieldCheck />}>
          {t("submit")}
        </Button>
        {onBack ? (
          <Button type="button" variant="ghost" icon={<RotateCcw />} mirrorIcon onClick={onBack}>
            {t("useDifferent")}
          </Button>
        ) : null}
      </form>
    </AuthCard>
  );
}

export function LoginForm() {
  const t = useTranslations("auth.login");
  const form = useTranslations("form");
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();
  const client = useClientErrors(formRef);
  const afterLogin = useAfterLogin();
  const oauthFailed = params.get("error") === "oauth";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: FieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) problems.email = form("invalidEmail");
    if (!password) problems.password = form("required");
    if (!client.show(problems)) return;
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        json: { email: email.trim(), password },
      }),
    );
    if (!result) return;
    if (result.mfa_required && result.mfa_token) setMfaToken(result.mfa_token);
    else if (result.user) afterLogin(result.user);
  };

  if (mfaToken) return <MfaStep token={mfaToken} onBack={() => setMfaToken(null)} />;
  const fieldErrors = { ...fieldErrorsFrom(error), ...client.errors };

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("newHere")}{" "}
          <Link href="/auth/register" className="font-medium text-primary hover:underline">
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {oauthFailed ? (
          <FormError
            error={
              new ApiError(0, {
                code: "oauth",
                message: t("oauthFailed"),
                hint: t("oauthHint"),
                details: {},
              })
            }
          />
        ) : null}
        <OAuthButtons />
        <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {fieldErrors.email || fieldErrors.password ? null : <FormError error={error} />}
          <Field label={t("email")} required error={fieldErrors.email}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                icon={<Mail />}
                dir="ltr"
                type="email"
                inputMode="email"
                enterKeyHint="next"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t("password")} required error={fieldErrors.password}>
            {(props) => (
              <PasswordInput
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                icon={<KeyRound />}
                enterKeyHint="go"
                autoComplete="current-password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            )}
          </Field>
          <div className="-mt-1 flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("forgot")}
            </Link>
          </div>
          <Button type="submit" variant="primary" loading={pending} icon={<LogIn />} mirrorIcon>
            {t("submit")}
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const form = useTranslations("form");
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useSubmit();
  const client = useClientErrors(formRef);
  const afterLogin = useAfterLogin("/onboarding");
  const fieldErrors = { ...fieldErrorsFrom(error), ...client.errors };
  const passwordError =
    client.errors.password ??
    (error?.code === "weak_password" ? error.message : fieldErrors.password);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: FieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) problems.email = form("invalidEmail");
    if (password.length < MIN_PASSWORD)
      problems.password = form("passwordShort", { min: MIN_PASSWORD });
    if (!client.show(problems)) return;
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/register", {
        method: "POST",
        json: { email: email.trim(), password, display_name: name.trim() },
      }),
    );
    if (result?.user) afterLogin(result.user);
  };

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons />
        <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {error &&
          error.code !== "weak_password" &&
          !fieldErrors.email &&
          !fieldErrors.password ? (
            <FormError error={error} />
          ) : null}
          <Field label={t("name")} hint={t("nameHint")} counter={{ value: name.length, max: 80 }}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                icon={<UserIcon />}
                autoComplete="name"
                enterKeyHint="next"
                placeholder={t("namePlaceholder")}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("email")} required error={fieldErrors.email}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                icon={<Mail />}
                dir="ltr"
                type="email"
                inputMode="email"
                enterKeyHint="next"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t("password")} required hint={t("passwordHint")} error={passwordError}>
            {(props) => (
              <PasswordInput
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                icon={<KeyRound />}
                enterKeyHint="go"
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={MIN_PASSWORD}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={pending} icon={<UserPlus />}>
            {t("submit")}
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const form = useTranslations("form");
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();
  const client = useClientErrors(formRef);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!client.show(EMAIL_PATTERN.test(email.trim()) ? {} : { email: form("invalidEmail") }))
      return;
    const result = await run(() =>
      apiJson<{ message: string }>("/api/v1/auth/password/forgot", {
        method: "POST",
        json: { email: email.trim() },
      }),
    );
    if (result) setSent(true);
  };
  if (sent) {
    return (
      <AuthCard title={t("sentTitle")} subtitle={t("sentSubtitle", { email })}>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">{t("back")}</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <FormError error={error} />
        <Field label={t("email")} required error={client.errors.email}>
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<Mail />}
              dir="ltr"
              type="email"
              inputMode="email"
              enterKeyHint="send"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending} icon={<Send />} mirrorIcon>
          {t("submit")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/auth/login">{t("back")}</Link>
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const form = useTranslations("form");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useSubmit();
  const client = useClientErrors(formRef);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: FieldErrors = {};
    if (password.length < MIN_PASSWORD)
      problems.password = form("passwordShort", { min: MIN_PASSWORD });
    else if (password !== confirm) problems.confirm = form("passwordsDiffer");
    if (!client.show(problems)) return;
    const result = await run(() =>
      apiJson<{ message: string }>("/api/v1/auth/password/reset", {
        method: "POST",
        json: { token, password },
      }),
    );
    if (result) setDone(true);
  };
  if (!token) {
    return (
      <AuthCard title={t("incompleteTitle")} subtitle={t("incompleteSubtitle")}>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/forgot-password">{t("requestNew")}</Link>
        </Button>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t("doneTitle")} subtitle={t("doneSubtitle")}>
        <Button asChild variant="primary" className="w-full">
          <Link href="/auth/login">{t("signIn")}</Link>
        </Button>
      </AuthCard>
    );
  }
  const weak = error?.code === "weak_password" ? error.message : null;
  return (
    <AuthCard title={t("title")}>
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {weak ? null : <FormError error={error} />}
        <Field
          label={t("newPassword")}
          required
          hint={t("passwordHint")}
          error={client.errors.password ?? weak}
        >
          {(props) => (
            <PasswordInput
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<KeyRound />}
              enterKeyHint="next"
              autoComplete="new-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>
        <Field label={t("confirm")} required error={client.errors.confirm}>
          {(props) => (
            <PasswordInput
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              icon={<KeyRound />}
              enterKeyHint="go"
              autoComplete="new-password"
              placeholder={t("confirmPlaceholder")}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending} icon={<ArrowRight />} mirrorIcon>
          {t("submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmail() {
  const t = useTranslations("auth.verify");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const queryClient = useQueryClient();
  const [state, setState] = useState<"pending" | "done" | "failed">(token ? "pending" : "failed");
  const [message, setMessage] = useState<string | null>(token ? null : t("missingCode"));
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiJson<User>("/api/v1/auth/verify-email", { method: "POST", json: { token } })
      .then((user) => {
        queryClient.setQueryData(SESSION_KEY, (current: User | null | undefined) =>
          current ? user : current,
        );
        setState("done");
      })
      .catch((failure: unknown) => {
        setMessage(failure instanceof ApiError ? failure.message : t("failedGeneric"));
        setState("failed");
      });
  }, [queryClient, t, token]);
  if (state === "pending")
    return (
      <AuthCard title={t("pendingTitle")} subtitle={t("pendingSubtitle")}>
        {null}
      </AuthCard>
    );
  if (state === "done") {
    return (
      <AuthCard title={t("doneTitle")} subtitle={t("doneSubtitle")}>
        <div className="flex flex-col items-center gap-4">
          <CircleCheck className="size-12 text-success" aria-hidden />
          <Button asChild variant="primary" className="w-full">
            <Link href="/">{t("start")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("failedTitle")} subtitle={message ?? t("failedGeneric")}>
      <p className="text-sm text-muted">{t("failedHint")}</p>
    </AuthCard>
  );
}

let capturedMfaToken: string | null | undefined;

function readMfaTokenFromHash(): string | null {
  if (capturedMfaToken === undefined) {
    const match = /token=([^&]+)/.exec(window.location.hash);
    capturedMfaToken = match ? decodeURIComponent(match[1]) : null;
    if (match) window.history.replaceState(null, "", window.location.pathname);
  }
  return capturedMfaToken;
}

const subscribeToNothing = () => () => undefined;

export function OAuthMfa() {
  const t = useTranslations("auth");
  const token = useSyncExternalStore(subscribeToNothing, readMfaTokenFromHash, () => undefined);
  if (token === undefined) return <AuthCard title={t("mfa.title")}>{null}</AuthCard>;
  if (!token) {
    return (
      <AuthCard title={t("expired.title")} subtitle={t("expired.subtitle")}>
        <Button asChild variant="primary" className="w-full">
          <Link href="/auth/login">{t("expired.signIn")}</Link>
        </Button>
      </AuthCard>
    );
  }
  return <MfaStep token={token} />;
}
