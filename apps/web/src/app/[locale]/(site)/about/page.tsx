import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DocumentStackIllustration } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { supportEnabled } from "@/config/site";
import { localizedPrinciples } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sitePages.about" });
  return pageMetadata(locale, "/about", t("metaTitle"), t("subtitle"));
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("sitePages.about");
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.about.title")}
        title={page("title", { brand: brand.name })}
        subtitle={page("subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.about.title") },
        ]}
        aside={<DocumentStackIllustration />}
      />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeader title={page("missionTitle")} />
          <div className="flex flex-col gap-4 text-lg text-muted">
            <p>{page("missionOne")}</p>
            <p>{page("missionTwo", { brand: brand.name })}</p>
          </div>
        </div>
      </Section>
      <Section tone="surface" aria-labelledby="principles-heading">
        <SectionHeader id="principles-heading" title={page("principlesTitle")} />
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {localizedPrinciples(locale).map((principle) => (
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
          <SectionHeader id="free-heading" title={page("freeTitle")} />
          <div className="flex flex-col gap-4 text-muted">
            <p>{page("freeOne")}</p>
            <p>{page("freeTwo")}</p>
            <p>
              {page("freeThree")}{" "}
              {supportEnabled ? (
                <Link href="/support" className="font-medium text-primary underline">
                  {page("support")}
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
