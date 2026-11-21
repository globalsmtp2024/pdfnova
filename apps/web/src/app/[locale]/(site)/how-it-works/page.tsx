import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MergeIllustration } from "@/components/illustrations";
import { Stepper } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeader } from "@/components/ui/section";
import { LIFECYCLE } from "@/content/pages";
import { Download, MousePointerClick, Upload } from "lucide-react";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE =
  "From the moment you drop a file to the moment it disappears, here is exactly what happens.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/how-it-works">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/how-it-works", "How it works", SUBTITLE);
}

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how-it-works">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        eyebrow={t("home.how.eyebrow")}
        title={t("home.how.title")}
        subtitle={SUBTITLE}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("home.how.eyebrow") }]}
        aside={<MergeIllustration />}
      />
      <Section>
        <Stepper
          steps={[
            {
              icon: Upload,
              title: t("home.how.steps.upload.title"),
              body: t("home.how.steps.upload.body"),
            },
            {
              icon: MousePointerClick,
              title: t("home.how.steps.choose.title"),
              body: t("home.how.steps.choose.body"),
            },
            {
              icon: Download,
              title: t("home.how.steps.download.title"),
              body: t("home.how.steps.download.body"),
            },
          ]}
        />
      </Section>
      <Section tone="surface" aria-labelledby="lifecycle-heading">
        <SectionHeader
          id="lifecycle-heading"
          eyebrow={t("home.privacy.eyebrow")}
          title={t("home.privacy.title")}
          subtitle={t("home.privacy.subtitle")}
        />
        <div className="relative mt-12">
          <span
            aria-hidden
            className="absolute inset-x-6 top-7 hidden h-px bg-gradient-to-r from-primary via-accent to-success md:block"
          />
          <Reveal as="ol" className="relative grid gap-6 md:grid-cols-5">
            {LIFECYCLE.map((step) => (
              <RevealItem
                key={step.title}
                as="li"
                className="flex flex-col items-center gap-3 text-center"
              >
                <span className="relative flex size-14 items-center justify-center rounded-2xl border border-border bg-background shadow-lifted">
                  <step.icon className="size-6 text-primary" aria-hidden />
                </span>
                <span className="font-mono text-xs text-muted" dir="ltr">
                  {step.time}
                </span>
                <h3 className="font-display font-semibold">{step.title}</h3>
                <p className="text-sm text-muted">{step.body}</p>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </Section>
    </>
  );
}
