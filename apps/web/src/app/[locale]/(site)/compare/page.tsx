import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { TOOLS } from "@/config/tools";
import { COMPARE_ROWS } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE =
  "An honest overview of what you get. No comparisons with other products, just facts you can check.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/compare">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/compare", "Overview", SUBTITLE);
}

export default async function ComparePage({ params }: PageProps<"/[locale]/compare">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        eyebrow={t("nav.resourcesItems.compare.title")}
        title={`${brand.name} at a glance`}
        subtitle={SUBTITLE}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.resourcesItems.compare.title") },
        ]}
      />
      <Section>
        <div className="overflow-x-auto rounded-(--radius-card) border border-border bg-surface shadow-soft">
          <table className="w-full min-w-[36rem] text-start text-sm">
            <caption className="sr-only">{`${brand.name} feature overview`}</caption>
            <thead className="bg-surface-muted text-start">
              <tr>
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  Feature
                </th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  {brand.name}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-5 py-4 text-start font-medium">
                    {row.feature}
                  </th>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2">
                      <CircleCheck
                        className="mt-0.5 size-4 shrink-0 text-success-strong"
                        aria-hidden
                      />
                      <span>
                        {row.feature === "Tools available today" ? (
                          <Link href="/tools" className="font-medium text-primary underline">
                            {row.value}
                          </Link>
                        ) : (
                          row.value
                        )}
                        {row.note ? (
                          <span className="block text-xs text-muted">{row.note}</span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout tone="info" className="mt-6">
          The catalog lists {TOOLS.length} tools. Each one is marked Coming soon until it actually
          works, and the changelog shows what shipped when.
        </Callout>
      </Section>
    </>
  );
}
