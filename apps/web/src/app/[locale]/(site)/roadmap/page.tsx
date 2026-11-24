import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { localizedReleases } from "@/content/changelog";
import { RELEASES_UR } from "@/content/changelog.ur";
import { initPage, pageMetadata } from "@/lib/page";

const LIMIT_KEYS = ["pdfa", "findReplace", "cloud", "languages"] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/roadmap">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "roadmapPage" });
  return pageMetadata(locale, "/roadmap", t("title"), t("subtitle"));
}

export default async function RoadmapPage({ params }: PageProps<"/[locale]/roadmap">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const upcoming = localizedReleases(locale, RELEASES_UR).filter(
    (release) => release.status !== "shipped",
  );
  return (
    <>
      <PageHero
        title={t("roadmapPage.title")}
        subtitle={t("roadmapPage.subtitle")}
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
                  {release.status === "in-progress"
                    ? t("roadmapPage.inProgress")
                    : t("roadmapPage.planned")}
                </Badge>
              ),
              items: release.highlights,
            }))}
          />
          <div>
            <h2 className="text-lg font-semibold">{t("roadmapPage.knownTitle")}</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-muted">
              {LIMIT_KEYS.map((key) => (
                <li key={key}>{t(`roadmapPage.limits.${key}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </>
  );
}
