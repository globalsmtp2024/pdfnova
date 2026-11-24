import { Activity, BookOpen, Gauge, KeyRound, Radio, Upload, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BentoGrid, FeatureCard } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { mergeSamples } from "@/content/api-samples";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/developers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.developers" });
  const page = await getTranslations({ locale, namespace: "devPage" });
  return pageMetadata(locale, "/developers", page("metaTitle"), t("subtitle"));
}

export default async function DevelopersPage({ params }: PageProps<"/[locale]/developers">) {
  await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("devPage");
  return (
    <>
      <PageHero
        eyebrow={t("nav.developers")}
        title={t("home.developers.title")}
        subtitle={t("home.developers.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("nav.developers") }]}
        aside={<CodeBlock samples={mergeSamples().slice(0, 1)} title="curl" />}
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href="/developers/api">{t("nav.developersItems.api.title")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">{t("dashboard.createKey")}</Link>
          </Button>
        </div>
      </PageHero>
      <Section>
        <SectionHeader title={page("built")} />
        <BentoGrid className="mt-8">
          <FeatureCard
            icon={KeyRound}
            title={page("keys.title")}
            body={page("keys.body")}
            color="#5B4BFF"
          />
          <FeatureCard
            icon={Upload}
            title={page("uploads.title")}
            body={page("uploads.body")}
            color="#12B5A6"
          />
          <FeatureCard
            icon={Radio}
            title={page("progress.title")}
            body={page("progress.body")}
            color="#F97316"
          />
          <FeatureCard
            icon={Gauge}
            title={page("limits.title")}
            body={page("limits.body")}
            color="#10B981"
          />
          <FeatureCard
            icon={BookOpen}
            title={page("openapi.title")}
            body={page("openapi.body")}
            color="#2F80ED"
            className="sm:col-span-2"
          />
          <FeatureCard
            icon={Webhook}
            title={page("webhooks.title")}
            body={page("webhooks.body")}
            color="#8B5CF6"
          />
          <FeatureCard
            icon={Activity}
            title={page("status.title")}
            body={page("status.body")}
            color="#EC4899"
          />
        </BentoGrid>
      </Section>
      <Section tone="surface">
        <SectionHeader title={page("samples")} />
        <CodeBlock samples={mergeSamples()} className="mt-8" />
      </Section>
    </>
  );
}
