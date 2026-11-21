import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Onboarding } from "@/components/account/onboarding";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/onboarding">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/onboarding">) {
  await initPage(params);
  return (
    <div className="container-page py-10">
      <Onboarding />
    </div>
  );
}
