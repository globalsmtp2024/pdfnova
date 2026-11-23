import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPage } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/admin">) {
  await initPage(params);
  const t = await getTranslations("admin");
  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <AdminPage />
    </div>
  );
}
