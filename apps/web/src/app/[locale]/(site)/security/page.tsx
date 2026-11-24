import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShieldIllustration } from "@/components/illustrations";
import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { localizedLifecycle, localizedProtections } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/security">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sitePages.security" });
  return pageMetadata(locale, "/security", t("metaTitle"), t("subtitle"));
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("sitePages.security");
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.security.title")}
        title={page("title")}
        subtitle={page("subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.security.title") },
        ]}
        aside={<ShieldIllustration className="max-w-64" />}
      />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2">
          {localizedProtections(locale).map((item) => (
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
          title={page("timelineTitle")}
          subtitle={page("timelineSubtitle")}
        />
        <ol className="mt-8 grid gap-3 md:grid-cols-5">
          {localizedLifecycle(locale).map((step, index) => (
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
        <Callout tone="info" title={page("reportTitle")}>
          {page("reportBefore")}{" "}
          <Link href="/contact" className="font-medium underline">
            {page("reportLink")}
          </Link>{" "}
          {page("reportAfter")}
        </Callout>
      </Section>
    </>
  );
}
