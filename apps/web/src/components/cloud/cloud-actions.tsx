"use client";

import { Cloud, CloudUpload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { CloudBrowser } from "@/components/cloud/cloud-browser";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toaster";
import { startCloudConnect, useCloudExport, useCloudProviders } from "@/lib/cloud";
import { useSession } from "@/lib/session";

export function CloudImportButtons({
  onImport,
  busy,
}: {
  onImport: (provider: string, fileId: string) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("cloud");
  const session = useSession();
  const providers = useCloudProviders(Boolean(session.data));
  const [active, setActive] = useState<string | null>(null);
  if (!session.data || !providers.data?.length) return null;
  const current = providers.data.find((entry) => entry.name === active);
  return (
    <>
      {providers.data.map((provider) => (
        <Button
          key={provider.name}
          variant="ghost"
          size="sm"
          data-cloud-import={provider.name}
          onClick={() => {
            if (provider.connected) setActive(provider.name);
            else void startCloudConnect(provider.name).catch(toastError);
          }}
        >
          <Cloud aria-hidden />
          {provider.connected
            ? t("importFrom", { service: provider.label })
            : t("connect", { service: provider.label })}
        </Button>
      ))}
      {current ? (
        <CloudBrowser
          open
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
          provider={current.name}
          label={current.label}
          mode="file"
          busy={busy}
          onPick={(entry) => {
            if (!entry.id) return;
            void onImport(current.name, entry.id)
              .then(() => setActive(null))
              .catch(toastError);
          }}
        />
      ) : null}
    </>
  );
}

export function CloudExportButtons({
  source,
}: {
  source: { library_file_id?: string; task_id?: string; output_file_id?: string };
}) {
  const t = useTranslations("cloud");
  const session = useSession();
  const providers = useCloudProviders(Boolean(session.data));
  const exporter = useCloudExport();
  const [active, setActive] = useState<string | null>(null);
  if (!session.data) return null;
  const connected = (providers.data ?? []).filter((entry) => entry.connected);
  const current = connected.find((entry) => entry.name === active);
  if (!connected.length) return null;
  return (
    <>
      {connected.map((provider) => (
        <Button
          key={provider.name}
          variant="outline"
          data-cloud-export={provider.name}
          onClick={() => setActive(provider.name)}
        >
          <CloudUpload aria-hidden />
          {t("saveTo", { service: provider.label })}
        </Button>
      ))}
      {current ? (
        <CloudBrowser
          open
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
          provider={current.name}
          label={current.label}
          mode="folder"
          busy={exporter.isPending}
          onPick={(entry) =>
            exporter.mutate(
              { provider: current.name, folder_id: entry.id, ...source },
              {
                onSuccess: (created) => {
                  toast.success(t("saved", { name: created.name }));
                  setActive(null);
                },
                onError: toastError,
              },
            )
          }
        />
      ) : null}
    </>
  );
}
