import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HelpCenter } from "@/components/help-center";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { HELP_TOPICS } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(
    locale,
    "/help",
    "Help center",
    "Answers to common questions about tools, files, privacy, fair use and the API.",
  );
}

export default async function HelpPage({ params }: PageProps<"/[locale]/help">) {
  await initPage(params);
  const t = await getTranslations();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HELP_TOPICS.flatMap((topic) => topic.items).map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHero
        align="center"
        title="How can we help?"
        subtitle="Search the answers below, or send us a message."
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("footer.links.help") }]}
      />
      <Section>
        <HelpCenter />
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-muted">Still stuck?</p>
          <Button asChild variant="primary">
            <Link href="/contact">{t("footer.links.contact")}</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
