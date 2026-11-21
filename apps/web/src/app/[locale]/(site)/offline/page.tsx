import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { StatusScreen } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { initPage } from "@/lib/page";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default async function OfflinePage({ params }: PageProps<"/[locale]/offline">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <StatusScreen
      icon={WifiOff}
      title={t("offline.title")}
      body={t("offline.body")}
      actions={
        <Button asChild variant="primary">
          <Link href="/">{t("common.tryAgain")}</Link>
        </Button>
      }
    />
  );
}
