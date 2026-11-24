import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Hero } from "@/components/marketing/hero";
import {
  BentoSection,
  DemoSection,
  DevelopersTeaser,
  FaqSection,
  FinalCta,
  HowItWorksSection,
  LanguagesStrip,
  PrivacySection,
  QuickActionsSection,
  ToolGridSection,
  UseCasesSection,
  WorkflowsTeaser,
} from "@/components/marketing/home-sections";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: { absolute: `${brand.name} · ${t("metaTitle")}` },
    description: t("subtitle"),
    alternates: alternatesFor(locale, "/"),
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    url: siteUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    description: t("subtitle"),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <QuickActionsSection />
      <ToolGridSection />
      <BentoSection />
      <HowItWorksSection />
      <PrivacySection />
      <DemoSection />
      <UseCasesSection />
      <WorkflowsTeaser />
      <DevelopersTeaser />
      <LanguagesStrip />
      <FaqSection />
      <FinalCta />
    </>
  );
}
