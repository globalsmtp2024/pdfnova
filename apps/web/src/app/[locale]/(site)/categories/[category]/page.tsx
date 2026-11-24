import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  CompressIllustration,
  DocumentStackIllustration,
  MergeIllustration,
  ShieldIllustration,
  SparkleIllustration,
  SplitIllustration,
} from "@/components/illustrations";
import { ToolCardStatic } from "@/components/tools/tool-card-static";
import { Accordion } from "@/components/ui/accordion";
import { CategoryPill } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { categoryByPath, TOOL_CATEGORIES, TOOLS, type ToolCategoryId } from "@/config/tools";
import { localizedCategoryFaq } from "@/content/pages";
import { WORKFLOWS } from "@/content/workflows";
import { WorkflowCard } from "@/components/marketing/workflow-card";
import { routing } from "@/i18n/routing";
import { initPage, pageMetadata } from "@/lib/page";

const ILLUSTRATIONS: Record<ToolCategoryId, typeof MergeIllustration> = {
  organize: MergeIllustration,
  optimize: CompressIllustration,
  convert_to_pdf: DocumentStackIllustration,
  convert_from_pdf: SplitIllustration,
  edit: DocumentStackIllustration,
  security: ShieldIllustration,
  ai: SparkleIllustration,
  image: DocumentStackIllustration,
};

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    TOOL_CATEGORIES.map((category) => ({ locale, category: category.path })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/categories/[category]">): Promise<Metadata> {
  const { locale, category: path } = await params;
  const category = categoryByPath(path);
  if (!category) return {};
  const t = await getTranslations({ locale, namespace: "categories" });
  return pageMetadata(
    locale,
    `/categories/${path}`,
    t(`${category.id}.title`),
    t(`${category.id}.description`),
  );
}

export default async function CategoryPage({
  params,
}: PageProps<"/[locale]/categories/[category]">) {
  const { locale, category: path } = await initPage(params);
  const category = categoryByPath(path);
  if (!category) notFound();
  const t = await getTranslations();
  const tools = TOOLS.filter((tool) => tool.category === category.id);
  const slugs = new Set(tools.map((tool) => tool.slug));
  const workflows = WORKFLOWS.filter((workflow) =>
    workflow.steps.some((step) => slugs.has(step.tool)),
  );
  const Illustration = ILLUSTRATIONS[category.id];
  const label = t(`categories.${category.id}.label`);
  return (
    <>
      <PageHero
        eyebrow={label}
        title={t(`categories.${category.id}.title`)}
        subtitle={t(`categories.${category.id}.description`)}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("common.allTools"), href: "/tools" },
          { label },
        ]}
        aside={
          <div
            className="rounded-(--radius-card) border border-border bg-surface/80 p-6 shadow-floating backdrop-blur"
            style={{ boxShadow: `0 30px 80px -40px ${category.color}` }}
          >
            <Illustration />
          </div>
        }
      />
      <Section aria-labelledby="category-tools">
        <h2 id="category-tools" className="text-h1 font-bold tracking-tight">
          {t("category.toolsTitle", { category: label })}
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <li key={tool.slug}>
              <ToolCardStatic tool={tool} />
            </li>
          ))}
        </ul>
      </Section>
      {workflows.length ? (
        <Section tone="surface" aria-labelledby="category-workflows">
          <h2 id="category-workflows" className="text-h2 font-bold">
            {t("category.workflowsTitle")}
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <li key={workflow.slug}>
                <WorkflowCard workflow={workflow} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section aria-labelledby="category-faq">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <h2 id="category-faq" className="text-h1 font-bold tracking-tight">
            {t("category.faqTitle")}
          </h2>
          <Accordion
            items={localizedCategoryFaq(locale, category.id).map((item, index) => ({
              id: `faq-${index}`,
              question: item.question,
              answer: item.answer,
            }))}
          />
        </div>
        <div className="mt-14">
          <h2 className="mb-4 font-display text-lg font-semibold">
            {t("category.otherCategories")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {TOOL_CATEGORIES.filter((entry) => entry.id !== category.id).map((entry) => (
              <CategoryPill
                key={entry.id}
                label={t(`categories.${entry.id}.label`)}
                color={entry.color}
                href={`/categories/${entry.path}`}
              />
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
