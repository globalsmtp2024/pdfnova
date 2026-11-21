import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AllToolsExplorer } from "@/components/tools/all-tools-explorer";
import { CategoryPill } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { TOOL_CATEGORIES } from "@/config/tools";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/tools">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "allTools" });
  return pageMetadata(locale, "/tools", t("metaTitle"), t("subtitle"));
}

export default async function AllToolsPage({ params }: PageProps<"/[locale]/tools">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title={t("allTools.title")}
        subtitle={t("allTools.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("allTools.title") }]}
      >
        <div className="flex flex-wrap gap-2">
          {TOOL_CATEGORIES.map((category) => (
            <CategoryPill
              key={category.id}
              label={t(`categories.${category.id}.label`)}
              color={category.color}
              href={`/categories/${category.path}`}
            />
          ))}
        </div>
      </PageHero>
      <div className="container-page py-12">
        <AllToolsExplorer />
      </div>
    </>
  );
}
