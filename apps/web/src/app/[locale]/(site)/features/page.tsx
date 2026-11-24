import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DocumentStackIllustration } from "@/components/illustrations";
import { FeaturesShowcase } from "@/components/marketing/features-showcase";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/features">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sitePages.features" });
  return pageMetadata(locale, "/features", t("metaTitle"), t("subtitle"));
}

export default async function FeaturesPage({ params }: PageProps<"/[locale]/features">) {
  await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("sitePages.features");
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.features.title")}
        title={page("title")}
        subtitle={page("subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.features.title") },
        ]}
        aside={<DocumentStackIllustration />}
      >
        <Button asChild variant="primary" className="w-fit">
          <Link href="/tools">{t("common.browseTools")}</Link>
        </Button>
      </PageHero>
      <Section>
        <FeaturesShowcase />
      </Section>
    </>
  );
}
