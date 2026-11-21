import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DocumentStackIllustration } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { supportEnabled } from "@/config/site";
import { PRINCIPLES } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE =
  "Documents shouldn’t be a chore, and fixing them shouldn’t cost money. That’s the whole idea.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/about", "About", SUBTITLE);
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.about.title")}
        title={`Why ${brand.name} exists`}
        subtitle={SUBTITLE}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.about.title") },
        ]}
        aside={<DocumentStackIllustration />}
      />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeader title="Our mission" />
          <div className="flex flex-col gap-4 text-lg text-muted">
            <p>
              Everyone handles documents: students submitting coursework, freelancers sending
              contracts, small businesses filing receipts, schools sharing course packs. Too often
              the tools are expensive, cluttered or careless with private files.
            </p>
            <p>
              {brand.name} puts every document tool in one fast, calm place, free for everyone, with
              privacy treated as a default rather than an upsell.
            </p>
          </div>
        </div>
      </Section>
      <Section tone="surface" aria-labelledby="principles-heading">
        <SectionHeader id="principles-heading" title="Principles we build by" />
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <li
              key={principle.title}
              className="flex gap-4 rounded-(--radius-card) border border-border bg-background p-6"
            >
              <principle.icon className="size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-display text-lg font-semibold">{principle.title}</h3>
                <p className="mt-1 text-muted">{principle.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section aria-labelledby="free-heading">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeader id="free-heading" title="How it stays free" />
          <div className="flex flex-col gap-4 text-muted">
            <p>
              Processing is efficient by design: files are handled by small, isolated workers and
              deleted quickly, so storage costs stay low.
            </p>
            <p>
              Fair-use limits stop abuse without getting in the way of normal use. They are public,
              generous and the same for everyone.
            </p>
            <p>
              Optional contributions help cover servers and development.{" "}
              {supportEnabled ? (
                <Link href="/support" className="font-medium text-primary underline">
                  Support the project
                </Link>
              ) : null}
            </p>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/contact">{t("footer.links.contact")}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
