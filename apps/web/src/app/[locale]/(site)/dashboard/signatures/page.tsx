import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EsignDashboard } from "@/components/esign/esign-dashboard";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/signatures">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "esign" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/signatures">) {
  await initPage(params);
  return (
    <div className="container-page py-10">
      <EsignDashboard />
    </div>
  );
}
