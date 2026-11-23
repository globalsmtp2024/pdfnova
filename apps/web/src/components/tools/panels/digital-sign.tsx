"use client";

import { FileKey2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState, type ChangeEvent } from "react";

import type { ToolPanelView } from "@/components/tools/panels/registry";
import { useSchemaPanel } from "@/components/tools/panels/schema";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";

const MAX_CERTIFICATE_BYTES = 64 * 1024;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function useDigitalSignPanel(
  files: LocalFile[],
  schema?: Record<string, unknown>,
): ToolPanelView {
  const t = useTranslations("tool_digital_sign");
  const base = useSchemaPanel(files, schema);
  const [certificate, setCertificate] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [tooLarge, setTooLarge] = useState(false);

  const clearSecrets = useCallback(() => {
    setCertificate("");
    setFileName("");
    setPassword("");
    base.clearSecrets?.();
  }, [base]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_CERTIFICATE_BYTES) {
      setTooLarge(true);
      return;
    }
    setTooLarge(false);
    setCertificate(toBase64(await file.arrayBuffer()));
    setFileName(file.name);
  };

  const options = (
    <div className="flex flex-col gap-4" data-digital-sign-panel>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="digital-sign-certificate" className="text-sm font-medium">
          {t("certificate")}
        </label>
        <Input
          id="digital-sign-certificate"
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          className="h-10"
          onChange={onFile}
          data-digital-sign-certificate
        />
        {fileName ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <FileKey2 className="size-3.5" aria-hidden />
            {fileName}
          </p>
        ) : null}
        {tooLarge ? (
          <p className="text-xs text-danger-strong" role="alert">
            {t("problems.tooLarge")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="digital-sign-password" className="text-sm font-medium">
          {t("password")}
        </label>
        <Input
          id="digital-sign-password"
          type="password"
          autoComplete="off"
          className="h-10"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-digital-sign-password
        />
      </div>
      <p className="text-xs text-muted">{t("note")}</p>
      {base.options}
    </div>
  );

  const secrets: Record<string, string> = certificate ? { pkcs12: certificate } : {};
  if (certificate && password) secrets.pkcs12_password = password;

  return {
    ...base,
    options,
    problem: certificate ? base.problem : t("problems.needCertificate"),
    secrets,
    clearSecrets,
  };
}
