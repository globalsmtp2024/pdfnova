"use client";

import { Cloud } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toaster";
import { startCloudConnect, useCloudDisconnect, useCloudProviders } from "@/lib/cloud";

export function CloudConnections() {
  const t = useTranslations("cloud");
  const providers = useCloudProviders(true);
  const disconnect = useCloudDisconnect();
  if (!providers.data?.length) {
    return <p className="text-sm text-muted">{t("noneConfigured")}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border" data-cloud-connections>
      {providers.data.map((provider) => (
        <li key={provider.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Cloud className="size-4 text-primary" aria-hidden />
            {provider.label}
            {provider.connected ? <Badge tone="success">{provider.account || t("connected")}</Badge> : null}
          </span>
          {provider.connected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate(provider.name, { onError: toastError })}
            >
              {t("disconnect")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="solid"
              onClick={() => void startCloudConnect(provider.name).catch(toastError)}
            >
              {t("connect", { service: provider.label })}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
