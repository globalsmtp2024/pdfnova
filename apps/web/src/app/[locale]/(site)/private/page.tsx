import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PrivateMode } from "@/components/private/private-mode";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/private">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privateMode" });
  return pageMetadata(locale, "/private", t("title"), t("subtitle"));
}

export default async function Page({ params }: PageProps<"/[locale]/private">) {
  await initPage(params);
  const t = await getTranslations("privateMode");
  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("subtitle")}</p>
      </div>
      <PrivateMode />
    </div>
  );
}
