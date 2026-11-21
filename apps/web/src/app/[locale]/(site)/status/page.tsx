import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { StatusBoard } from "@/components/status-board";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/status">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "status" });
  return pageMetadata(locale, "/status", t("metaTitle"), t("subtitle"));
}

export default async function StatusPage({ params }: PageProps<"/[locale]/status">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title={t("status.title")}
        subtitle={t("status.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("status.title") }]}
      />
      <Section>
        <div className="mx-auto max-w-2xl">
          <StatusBoard />
        </div>
      </Section>
    </>
  );
}
