import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BatchRunner } from "@/components/tools/batch-runner";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/batch">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "batch" });
  return pageMetadata(locale, "/batch", t("title"), t("subtitle"));
}

export default async function Page({ params }: PageProps<"/[locale]/batch">) {
  await initPage(params);
  const t = await getTranslations("batch");
  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("subtitle")}</p>
      </div>
      <BatchRunner />
    </div>
  );
}
