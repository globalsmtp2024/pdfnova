"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { AuthCard, OAuthButtons } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ApiError, apiJson } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";
import type { LoginResponse, User } from "@/lib/types";

type FieldErrors = Record<string, string>;

function useSubmit() {
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
              message: "Something went wrong.",
              hint: "Please try again.",
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
  const [code, setCode] = useState("");
  const { pending, error, run } = useSubmit();
  const afterLogin = useAfterLogin();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/mfa/login", {
        method: "POST",
        json: { mfa_token: token, code },
      }),
    );
    if (result?.user) afterLogin(result.user);
  };
  return (
    <AuthCard
      title="Two-step verification"
      subtitle="Enter the 6-digit code from your authenticator app, or a recovery code."
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <FormError error={error} />
        <Field label="Verification code">
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending} disabled={code.trim().length < 6}>
          Verify and sign in
        </Button>
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            Use a different account
          </Button>
        ) : null}
      </form>
    </AuthCard>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();
  const afterLogin = useAfterLogin();
  const oauthFailed = params.get("error") === "oauth";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/login", { method: "POST", json: { email, password } }),
    );
    if (!result) return;
    if (result.mfa_required && result.mfa_token) setMfaToken(result.mfa_token);
    else if (result.user) afterLogin(result.user);
  };

  if (mfaToken) return <MfaStep token={mfaToken} onBack={() => setMfaToken(null)} />;
  const fieldErrors = fieldErrorsFrom(error);

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to keep your files, limits and settings in one place."
      footer={
        <>
          New here?{" "}
          <Link href="/auth/register" className="font-medium text-primary hover:underline">
            Create a free account
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
                message: "We couldn't sign you in with that provider.",
                hint: "Try again, or use your email and password.",
                details: {},
              })
            }
          />
        ) : null}
        <OAuthButtons />
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {fieldErrors.email || fieldErrors.password ? null : <FormError error={error} />}
          <Field label="Email" error={fieldErrors.email}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                type="password"
                autoComplete="current-password"
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
              Forgot password?
            </Link>
          </div>
          <Button type="submit" variant="primary" loading={pending}>
            Sign in
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useSubmit();
  const afterLogin = useAfterLogin("/onboarding");
  const fieldErrors = fieldErrorsFrom(error);
  const passwordError = error?.code === "weak_password" ? error.message : fieldErrors.password;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() =>
      apiJson<LoginResponse>("/api/v1/auth/register", {
        method: "POST",
        json: { email, password, display_name: name },
      }),
    );
    if (result?.user) afterLogin(result.user);
  };

  return (
    <AuthCard
      title="Create your free account"
      subtitle="Higher daily limits, larger files and your settings saved."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons />
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {error &&
          error.code !== "weak_password" &&
          !fieldErrors.email &&
          !fieldErrors.password ? (
            <FormError error={error} />
          ) : null}
          <Field label="Name" hint="Optional. Shown in your workspace.">
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>
          <Field
            label="Password"
            hint="At least 10 characters. A short phrase works well."
            error={passwordError}
          >
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={10}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={pending}>
            Create account
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() =>
      apiJson<{ message: string }>("/api/v1/auth/password/forgot", {
        method: "POST",
        json: { email },
      }),
    );
    if (result) setSent(true);
  };
  if (sent) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle={`If an account exists for ${email}, a reset link is on its way. It works for one hour.`}
      >
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a secure link to choose a new one."
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <FormError error={error} />
        <Field label="Email">
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending}>
          Send reset link
        </Button>
        <Button asChild variant="ghost">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useSubmit();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      <AuthCard
        title="Link incomplete"
        subtitle="This reset link is missing its code. Open the link from your email again, or request a new one."
      >
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard
        title="Password updated"
        subtitle="You've been signed out everywhere. Sign in with your new password."
      >
        <Button asChild variant="primary" className="w-full">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {error?.code === "weak_password" ? null : <FormError error={error} />}
        <Field
          label="New password"
          hint="At least 10 characters."
          error={error?.code === "weak_password" ? error.message : null}
        >
          {(props) => (
            <Input
              id={props.id}
              aria-describedby={props.describedBy}
              invalid={props.invalid}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const queryClient = useQueryClient();
  const [state, setState] = useState<"pending" | "done" | "failed">(token ? "pending" : "failed");
  const [message, setMessage] = useState("This link is missing its code.");
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
        setMessage(
          failure instanceof ApiError ? failure.message : "We couldn't confirm your email.",
        );
        setState("failed");
      });
  }, [queryClient, token]);
  if (state === "pending")
    return (
      <AuthCard title="Confirming your email…" subtitle="This only takes a moment.">
        {null}
      </AuthCard>
    );
  if (state === "done") {
    return (
      <AuthCard title="Email confirmed" subtitle="Thanks! Your account is fully set up.">
        <div className="flex flex-col items-center gap-4">
          <CircleCheck className="size-12 text-success" aria-hidden />
          <Button asChild variant="primary" className="w-full">
            <Link href="/">Start using your account</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="We couldn't confirm your email" subtitle={message}>
      <p className="text-sm text-muted">
        Sign in and request a new confirmation link from your account.
      </p>
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
  const token = useSyncExternalStore(subscribeToNothing, readMfaTokenFromHash, () => undefined);
  if (token === undefined) return <AuthCard title="Two-step verification">{null}</AuthCard>;
  if (!token) {
    return (
      <AuthCard title="Sign-in expired" subtitle="Start signing in again to continue.">
        <Button asChild variant="primary" className="w-full">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return <MfaStep token={token} />;
}
