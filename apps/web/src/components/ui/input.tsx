"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-(--radius-control) border border-border-strong bg-surface px-3.5 text-sm text-foreground shadow-soft transition-colors outline-none placeholder:text-muted/70 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ className, invalid, icon, trailing, ...props }: InputProps) {
  const field = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-11", icon ? "ps-10" : null, trailing ? "pe-11" : null, className)}
      {...props}
    />
  );
  if (!icon && !trailing) return field;
  return (
    <div className="relative">
      {icon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted [&_svg]:size-4"
        >
          {icon}
        </span>
      ) : null}
      {field}
      {trailing ? (
        <span className="absolute inset-y-0 end-1.5 flex items-center">{trailing}</span>
      ) : null}
    </div>
  );
}

export type PasswordInputProps = Omit<InputProps, "type" | "trailing">;

export function PasswordInput(props: PasswordInputProps) {
  const t = useTranslations("form");
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      dir="ltr"
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      }
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "min-h-24 py-2.5", className)}
      {...props}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-11 cursor-pointer", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  counter?: { value: number; max: number };
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
};

export function Field({ label, hint, error, required, counter, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required ? (
            <span aria-hidden className="ms-0.5 text-danger">
              *
            </span>
          ) : null}
        </label>
        {counter ? (
          <span
            className={cn(
              "text-xs tabular-nums",
              counter.value > counter.max ? "text-danger" : "text-muted",
            )}
            aria-hidden
          >
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function focusFirstInvalid(form: HTMLFormElement | null): void {
  const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  target?.focus();
}
