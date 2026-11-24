import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { localizedReleases } from "@/content/changelog";
import { RELEASES_UR } from "@/content/changelog.ur";
import { initPage, pageMetadata } from "@/lib/page";

const STATUS_TONE = { shipped: "success", "in-progress": "primary", planned: "neutral" } as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/changelog">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelogPage" });
  return pageMetadata(locale, "/changelog", t("title"), t("subtitle"));
}

export default async function ChangelogPage({ params }: PageProps<"/[locale]/changelog">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const order = { "in-progress": 0, shipped: 1, planned: 2 } as const;
  const releases = [...localizedReleases(locale, RELEASES_UR)].sort(
    (a, b) => order[a.status] - order[b.status],
  );
  const statusLabel = {
    shipped: t("changelogPage.shipped"),
    "in-progress": t("changelogPage.inProgress"),
    planned: t("changelogPage.planned"),
  } as const;
  return (
    <>
      <PageHero
        title={t("changelogPage.title")}
        subtitle={t("changelogPage.subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("footer.links.changelog") },
        ]}
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <Timeline
            entries={releases.map((release) => ({
              id: release.version,
              date: `v${release.version} · ${release.date}`,
              title: release.title,
              body: release.summary,
              badge: (
                <Badge tone={STATUS_TONE[release.status]}>{statusLabel[release.status]}</Badge>
              ),
              items: release.highlights,
            }))}
          />
        </div>
      </Section>
    </>
  );
}
