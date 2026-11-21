import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Dashboard } from "@/components/account/dashboard";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard">) {
  await initPage(params);
  return (
    <div className="container-page py-10">
      <Dashboard />
    </div>
  );
}
