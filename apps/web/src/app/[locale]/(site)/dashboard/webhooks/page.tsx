import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WebhooksPage } from "@/components/webhooks/webhooks-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/webhooks">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "webhooks" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/webhooks">) {
  await initPage(params);
  const t = await getTranslations("webhooks");
  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("subtitle")}</p>
      </div>
      <WebhooksPage />
    </div>
  );
}
