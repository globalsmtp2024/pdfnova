import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EsignNew } from "@/components/esign/esign-new";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/signatures/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "esign" });
  return { title: t("newTitle"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/signatures/new">) {
  await initPage(params);
  return (
    <div className="container-page py-10">
      <EsignNew />
    </div>
  );
}
