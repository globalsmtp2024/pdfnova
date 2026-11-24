import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { localizedCommitments } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/accessibility">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sitePages.accessibility" });
  return pageMetadata(locale, "/accessibility", t("metaTitle"), t("subtitle"));
}

export default async function AccessibilityPage({ params }: PageProps<"/[locale]/accessibility">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("sitePages.accessibility");
  return (
    <>
      <PageHero
        title={page("title")}
        subtitle={page("subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("footer.links.accessibility") },
        ]}
      />
      <Section>
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <ul className="flex flex-col gap-3">
            {localizedCommitments(locale).map((item) => (
              <li key={item} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-strong" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <Callout tone="info" title={page("limitsTitle")}>
            {page("limitsBody")}
          </Callout>
          <p className="text-muted">
            {page("helpBefore", { brand: brand.name })}{" "}
            <Link href="/contact" className="font-medium text-primary underline">
              {page("contactLink")}
            </Link>
            {page("helpMiddle")}{" "}
            <Link href="/shortcuts" className="font-medium text-primary underline">
              {page("shortcutsLink")}
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
