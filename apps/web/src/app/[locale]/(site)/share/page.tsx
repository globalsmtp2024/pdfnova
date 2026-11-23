import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShareTarget } from "@/components/pwa/share-target";
import { initPage } from "@/lib/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/share">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "share" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/share">) {
  await initPage(params);
  const t = await getTranslations("share");
  return (
    <div className="container-page flex max-w-2xl flex-col gap-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <ShareTarget />
    </div>
  );
}
