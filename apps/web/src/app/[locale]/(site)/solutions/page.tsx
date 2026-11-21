import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { SOLUTIONS } from "@/content/solutions";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE = "Ready-made ways to use every tool, tuned for how different people work.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/solutions">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/solutions", "Solutions", SUBTITLE);
}

export default async function SolutionsPage({ params }: PageProps<"/[locale]/solutions">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        eyebrow={t("nav.solutions")}
        title="Solutions for every kind of work"
        subtitle={SUBTITLE}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("nav.solutions") }]}
      />
      <Section>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTIONS.map((solution) => (
            <li key={solution.slug}>
              <Link
                href={`/solutions/${solution.slug}`}
                className="gradient-border group flex h-full flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lifted"
              >
                <span
                  className="flex size-12 items-center justify-center rounded-2xl text-white shadow-lifted"
                  style={{ background: solution.color }}
                >
                  <solution.icon className="size-6" aria-hidden />
                </span>
                <h2 className="text-h3 font-semibold">{solution.title}</h2>
                <p className="text-sm text-muted">{solution.short}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  {t("common.learnMore")}
                  <ArrowRight
                    className="flip-rtl size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
