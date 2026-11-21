import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShieldIllustration } from "@/components/illustrations";
import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { LIFECYCLE, PROTECTIONS } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

const TITLE = "Security and privacy, explained plainly";
const SUBTITLE =
  "These are the protections that are built and running today. We don’t claim certifications we don’t have.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/security">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/security", "Security and privacy", SUBTITLE);
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.security.title")}
        title={TITLE}
        subtitle={SUBTITLE}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.security.title") },
        ]}
        aside={<ShieldIllustration className="max-w-64" />}
      />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2">
          {PROTECTIONS.map((item) => (
            <li
              key={item.title}
              className="flex gap-4 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-subtle text-success-strong">
                <item.icon className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="surface" aria-labelledby="timeline-heading">
        <SectionHeader
          id="timeline-heading"
          title="The auto-deletion timeline"
          subtitle="Every file follows the same short lifecycle."
        />
        <ol className="mt-8 grid gap-3 md:grid-cols-5">
          {LIFECYCLE.map((step, index) => (
            <li
              key={step.title}
              className="rounded-(--radius-card) border border-border bg-background p-4"
            >
              <span className="font-mono text-xs text-muted" dir="ltr">
                {index + 1}. {step.time}
              </span>
              <h3 className="mt-1 font-display font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section>
        <Callout tone="info" title="Found a vulnerability?">
          Please report it privately through the{" "}
          <Link href="/contact" className="font-medium underline">
            contact form
          </Link>{" "}
          with the topic Security report. We appreciate responsible disclosure.
        </Callout>
      </Section>
    </>
  );
}
