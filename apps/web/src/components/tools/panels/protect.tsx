"use client";

import { Copy, Eye, EyeOff, KeyRound, ShieldAlert, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  generatePassword,
  MAX_PASSWORD_BYTES,
  passwordByteLength,
  passwordStrength,
  type PasswordStrength,
} from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const PERMISSIONS = [
  "print",
  "printHigh",
  "copy",
  "modify",
  "annotate",
  "fillForms",
  "assemble",
] as const;

type Permission = (typeof PERMISSIONS)[number];

const PAYLOAD_KEYS: Record<Permission, string> = {
  print: "allow_print",
  printHigh: "allow_print_high_quality",
  copy: "allow_copy",
  modify: "allow_modify",
  annotate: "allow_annotate",
  fillForms: "allow_fill_forms",
  assemble: "allow_assemble",
};

const ALL_ALLOWED: Record<Permission, boolean> = {
  print: true,
  printHigh: true,
  copy: true,
  modify: true,
  annotate: true,
  fillForms: true,
  assemble: true,
};

const METER_COLORS = [
  "bg-danger",
  "bg-danger",
  "bg-warning",
  "bg-success",
  "bg-success-strong",
] as const;

function SecretField({
  id,
  label,
  value,
  visible,
  onToggle,
  onChange,
  invalid,
  showLabel,
  hideLabel,
  dataAttribute,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  invalid: boolean;
  showLabel: string;
  hideLabel: string;
  dataAttribute: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          className="h-10 pe-10"
          value={value}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
          {...{ [dataAttribute]: "" }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function StrengthMeter({ strength }: { strength: PasswordStrength }) {
  const t = useTranslations("tool_protect");
  return (
    <div className="flex flex-col gap-1.5" data-strength={strength.level}>
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              strength.level !== "empty" && index < Math.max(strength.score, 1)
                ? METER_COLORS[strength.score]
                : "bg-surface-muted",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {t("strengthLabel", { level: t(`strength.${strength.level}`) })}
      </p>
      {strength.hints.length ? (
        <ul className="flex flex-col gap-0.5 text-xs text-warning-strong">
          {strength.hints.map((hint) => (
            <li key={hint}>{t(`hints.${hint}`)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function useProtectPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_protect");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [owner, setOwner] = useState("");
  const [useOwner, setUseOwner] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ownerVisible, setOwnerVisible] = useState(false);
  const [allowed, setAllowed] = useState<Record<Permission, boolean>>(ALL_ALLOWED);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const blocked = PERMISSIONS.filter((permission) => !allowed[permission]).length;

  const clearSecrets = useCallback(() => {
    setPassword("");
    setConfirm("");
    setOwner("");
    setVisible(false);
    setOwnerVisible(false);
  }, []);

  const generate = () => {
    const value = generatePassword(20);
    setPassword(value);
    setConfirm(value);
    setVisible(true);
    toast.success(t("generated"));
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const problem = !password
    ? t("problems.needPassword")
    : passwordByteLength(password) > MAX_PASSWORD_BYTES
      ? t("problems.tooLong", { max: MAX_PASSWORD_BYTES })
      : password !== confirm
        ? t("problems.mismatch")
        : useOwner && owner && passwordByteLength(owner) > MAX_PASSWORD_BYTES
          ? t("problems.ownerTooLong", { max: MAX_PASSWORD_BYTES })
          : null;

  const payload = Object.fromEntries(
    PERMISSIONS.map((permission) => [
      PAYLOAD_KEYS[permission],
      permission === "printHigh" ? allowed.print && allowed.printHigh : allowed[permission],
    ]),
  );

  const secrets: Record<string, string> = password ? { user_password: password } : {};
  if (password && useOwner && owner) secrets.owner_password = owner;

  const mismatch = confirm.length > 0 && password !== confirm;

  const options = (
    <div className="flex flex-col gap-4" data-protect-panel>
      <SecretField
        id="protect-password"
        label={t("passwordLabel")}
        value={password}
        visible={visible}
        onToggle={() => setVisible((current) => !current)}
        onChange={setPassword}
        invalid={false}
        showLabel={t("show")}
        hideLabel={t("hide")}
        dataAttribute="data-protect-password"
      />
      <SecretField
        id="protect-confirm"
        label={t("confirmLabel")}
        value={confirm}
        visible={visible}
        onToggle={() => setVisible((current) => !current)}
        onChange={setConfirm}
        invalid={mismatch}
        showLabel={t("show")}
        hideLabel={t("hide")}
        dataAttribute="data-protect-confirm"
      />
      {mismatch ? (
        <p className="-mt-2 text-xs text-danger-strong" role="alert">
          {t("problems.mismatch")}
        </p>
      ) : null}
      <StrengthMeter strength={strength} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={generate} data-protect-generate>
          <Wand2 aria-hidden />
          {t("generate")}
        </Button>
        {password ? (
          <Button type="button" size="sm" variant="ghost" onClick={copyPassword}>
            <Copy aria-hidden />
            {t("copy")}
          </Button>
        ) : null}
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-strong">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("warning")}
      </p>

      <fieldset className="flex flex-col">
        <legend className="mb-1 text-sm font-medium">{t("permissionsTitle")}</legend>
        {PERMISSIONS.map((permission) => (
          <ToggleRow
            key={permission}
            id={`protect-allow-${permission}`}
            label={t(`permissions.${permission}.label`)}
            description={t(`permissions.${permission}.description`)}
            checked={
              permission === "printHigh" ? allowed.print && allowed.printHigh : allowed[permission]
            }
            onChange={(value) =>
              setAllowed((current) => ({
                ...current,
                [permission]: value,
                ...(permission === "printHigh" && value ? { print: true } : {}),
              }))
            }
          />
        ))}
        <p className="px-3 pt-1 text-xs text-muted">{t("accessibilityNote")}</p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <ToggleRow
          id="protect-use-owner"
          label={t("ownerToggle")}
          description={t("ownerHelp")}
          checked={useOwner}
          onChange={(value) => {
            setUseOwner(value);
            if (!value) setOwner("");
          }}
        />
        {useOwner ? (
          <SecretField
            id="protect-owner"
            label={t("ownerLabel")}
            value={owner}
            visible={ownerVisible}
            onToggle={() => setOwnerVisible((current) => !current)}
            onChange={setOwner}
            invalid={false}
            showLabel={t("show")}
            hideLabel={t("hide")}
            dataAttribute="data-protect-owner"
          />
        ) : (
          <p className="flex items-start gap-2 px-3 text-xs text-muted">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("ownerRandom")}
          </p>
        )}
      </div>
    </div>
  );

  return {
    main: null,
    options,
    payload,
    problem,
    summary:
      files.length && !problem
        ? blocked
          ? t("summaryBlocked", { count: blocked })
          : t("summaryOpen")
        : null,
    secrets,
    clearSecrets,
  };
}
