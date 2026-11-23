import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { RELEASES } from "@/content/changelog";
import { initPage, pageMetadata } from "@/lib/page";

const TITLE = "Roadmap";
const SUBTITLE = "What we are building next and the limits of what exists today.";
const KNOWN_LIMITS = [
  "PDF/A files carry an embedded color profile but are not yet validated by an independent checker.",
  "Find and replace in the editor works on text objects and can miss text split across several objects.",
  "Cloud imports are verified against a test provider; live provider checks need real app credentials.",
  "Interface languages other than English and Urdu fall back to English until translations are reviewed.",
];

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/roadmap">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/roadmap", TITLE, SUBTITLE);
}

export default async function RoadmapPage({ params }: PageProps<"/[locale]/roadmap">) {
  await initPage(params);
  const t = await getTranslations();
  const upcoming = RELEASES.filter((release) => release.status !== "shipped");
  return (
    <>
      <PageHero
        title={TITLE}
        subtitle={SUBTITLE}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("footer.links.roadmap") }]}
      />
      <Section>
        <div className="mx-auto max-w-3xl space-y-10">
          <Timeline
            entries={upcoming.map((release) => ({
              id: release.version,
              date: `v${release.version} · ${release.date}`,
              title: release.title,
              body: release.summary,
              badge: (
                <Badge tone={release.status === "in-progress" ? "primary" : "neutral"}>
                  {release.status === "in-progress" ? "In progress" : "Planned"}
                </Badge>
              ),
              items: release.highlights,
            }))}
          />
          <div>
            <h2 className="text-lg font-semibold">Known limitations today</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-muted">
              {KNOWN_LIMITS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </>
  );
}
