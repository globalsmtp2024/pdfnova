import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Settings } from "@/components/account/settings";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/settings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/settings">) {
  await initPage(params);
  return (
    <div className="container-page py-10">
      <Settings />
    </div>
  );
}
