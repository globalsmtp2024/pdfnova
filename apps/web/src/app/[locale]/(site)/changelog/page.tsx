import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { RELEASES } from "@/content/changelog";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE = "What shipped, what we’re building now and what comes next.";
const STATUS_TONE = { shipped: "success", "in-progress": "primary", planned: "neutral" } as const;
const STATUS_LABEL = {
  shipped: "Shipped",
  "in-progress": "In progress",
  planned: "Planned",
} as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/changelog">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/changelog", "Changelog and roadmap", SUBTITLE);
}

export default async function ChangelogPage({ params }: PageProps<"/[locale]/changelog">) {
  await initPage(params);
  const t = await getTranslations();
  const order = { "in-progress": 0, shipped: 1, planned: 2 } as const;
  const releases = [...RELEASES].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <>
      <PageHero
        title="Changelog and roadmap"
        subtitle={SUBTITLE}
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
                <Badge tone={STATUS_TONE[release.status]}>{STATUS_LABEL[release.status]}</Badge>
              ),
              items: release.highlights,
            }))}
          />
        </div>
      </Section>
    </>
  );
}
