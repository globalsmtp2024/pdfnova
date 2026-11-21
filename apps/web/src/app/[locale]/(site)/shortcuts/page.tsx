import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShortcutList } from "@/components/layout/shortcuts";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/shortcuts">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shortcuts" });
  return pageMetadata(locale, "/shortcuts", t("metaTitle"), t("subtitle"));
}

export default async function ShortcutsPage({ params }: PageProps<"/[locale]/shortcuts">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title={t("shortcuts.title")}
        subtitle={t("shortcuts.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("shortcuts.title") }]}
      />
      <Section>
        <div className="mx-auto max-w-2xl rounded-(--radius-card) border border-border bg-surface px-6 shadow-soft">
          <ShortcutList />
        </div>
      </Section>
    </>
  );
}
