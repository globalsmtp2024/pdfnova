import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DocumentStackIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { BentoGrid, FeatureCard } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { localizedFeatures } from "@/content/pages";
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
  const { locale } = await initPage(params);
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
        <BentoGrid>
          {localizedFeatures(locale).map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              body={feature.body}
              color={feature.color}
              className={feature.wide ? "sm:col-span-2" : undefined}
              badge={
                feature.status === "later" ? (
                  <Badge>{t("home.bento.comingLater")}</Badge>
                ) : (
                  <Badge tone="success">{t("common.free")}</Badge>
                )
              }
            />
          ))}
        </BentoGrid>
      </Section>
    </>
  );
}
