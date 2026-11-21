import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { StatusScreen } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { initPage } from "@/lib/page";

export const metadata: Metadata = { title: "Maintenance", robots: { index: false } };

export default async function MaintenancePage({ params }: PageProps<"/[locale]/maintenance">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <StatusScreen
      icon={Wrench}
      title={t("maintenance.title")}
      body={t("maintenance.body")}
      actions={
        <Button asChild variant="outline">
          <Link href="/status">{t("footer.status")}</Link>
        </Button>
      }
    />
  );
}
