import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EsignSign } from "@/components/esign/esign-sign";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign/[token]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "esign" });
  return { title: t("signPageTitle"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/sign/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return (
    <div className="container-page max-w-4xl py-10">
      <EsignSign token={token} />
    </div>
  );
}
