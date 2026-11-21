import { Coffee, Heart, HeartHandshake, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { donationLinks, supportEnabled } from "@/config/site";
import { initPage, pageMetadata } from "@/lib/page";

const ICONS: Record<string, LucideIcon> = {
  githubSponsors: Heart,
  buyMeACoffee: Coffee,
  kofi: HeartHandshake,
};

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/support">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  return {
    ...pageMetadata(locale, "/support", t("metaTitle"), t("subtitle")),
    robots: supportEnabled ? undefined : { index: false },
  };
}

export default async function SupportPage({ params }: PageProps<"/[locale]/support">) {
  await initPage(params);
  if (!supportEnabled) notFound();
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("support.title") }]}
      />
      <Section>
        <ul className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {donationLinks.map((link) => {
            const Icon = ICONS[link.id] ?? Heart;
            return (
              <li key={link.id}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gradient-border flex h-full flex-col items-center gap-3 rounded-(--radius-card) border border-border bg-surface p-6 text-center shadow-soft transition-transform hover:-translate-y-0.5"
                >
                  <Icon className="size-8 text-primary" aria-hidden />
                  <span className="font-display font-semibold">{t(`support.${link.id}`)}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <div className="mx-auto mt-12 max-w-3xl">
          <h2 className="font-display text-lg font-semibold">{t("support.other")}</h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-muted">
            {(["share", "feedback", "translate"] as const).map((key) => (
              <li key={key}>{t(`support.otherItems.${key}`)}</li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}
