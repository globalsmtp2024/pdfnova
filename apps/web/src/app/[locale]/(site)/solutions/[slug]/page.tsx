import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { WorkflowCard } from "@/components/marketing/workflow-card";
import { ToolCardStatic } from "@/components/tools/tool-card-static";
import { Accordion } from "@/components/ui/accordion";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { findTool, type ToolDefinition } from "@/config/tools";
import { findSolution, SOLUTIONS } from "@/content/solutions";
import { findWorkflow } from "@/content/workflows";
import { routing } from "@/i18n/routing";
import { initPage, pageMetadata } from "@/lib/page";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    SOLUTIONS.map((solution) => ({ locale, slug: solution.slug })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/solutions/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const solution = findSolution(slug);
  return solution
    ? pageMetadata(locale, `/solutions/${slug}`, `${solution.title}`, solution.heroBody)
    : {};
}

export default async function SolutionPage({ params }: PageProps<"/[locale]/solutions/[slug]">) {
  const { slug } = await initPage(params);
  const solution = findSolution(slug);
  if (!solution) notFound();
  const t = await getTranslations();
  const tools = solution.tools
    .map((entry) => findTool(entry))
    .filter((tool): tool is ToolDefinition => tool !== undefined);
  const workflow = findWorkflow(solution.workflow);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: solution.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PageHero
        eyebrow={solution.title}
        title={solution.heroTitle}
        subtitle={solution.heroBody}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.solutions"), href: "/solutions" },
          { label: solution.title },
        ]}
        aside={
          <div
            className="flex aspect-square max-w-72 items-center justify-center rounded-[2rem] text-white shadow-floating"
            style={{ background: `linear-gradient(135deg, ${solution.color}, #0b0d17)` }}
          >
            <solution.icon className="size-28" aria-hidden />
          </div>
        }
      />
      <Section aria-labelledby="pains-heading">
        <SectionHeader id="pains-heading" title="Sound familiar?" />
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {solution.pains.map((pain) => (
            <li
              key={pain}
              className="flex gap-3 rounded-(--radius-card) border border-border bg-surface p-5"
            >
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-strong" aria-hidden />
              {pain}
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="surface" aria-labelledby="solution-tools">
        <SectionHeader id="solution-tools" title="The tools that help" />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.slug}>
              <ToolCardStatic tool={tool} />
            </li>
          ))}
        </ul>
      </Section>
      {workflow ? (
        <Section aria-labelledby="solution-workflow">
          <SectionHeader id="solution-workflow" title="A sample workflow" />
          <div className="mt-8 max-w-xl">
            <WorkflowCard workflow={workflow} />
          </div>
        </Section>
      ) : null}
      <Section tone="surface" aria-labelledby="solution-faq">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeader id="solution-faq" title={t("category.faqTitle")} />
          <Accordion
            items={solution.faq.map((item, index) => ({
              id: `faq-${index}`,
              question: item.question,
              answer: item.answer,
            }))}
          />
        </div>
      </Section>
    </>
  );
}
