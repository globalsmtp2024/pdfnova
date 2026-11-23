import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EsignDetail } from "@/components/esign/esign-detail";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/signatures/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "esign" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/signatures/[id]">) {
  const { locale, id } = await params;
  const { setRequestLocale } = await import("next-intl/server");
  setRequestLocale(locale);
  return (
    <div className="container-page py-10">
      <EsignDetail id={id} />
    </div>
  );
}
