import { MousePointerClick, Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WorkflowIllustration } from "@/components/illustrations";
import { WorkflowCard } from "@/components/marketing/workflow-card";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeader } from "@/components/ui/section";
import { findTool } from "@/config/tools";
import { WORKFLOWS } from "@/content/workflows";
import { initPage, pageMetadata } from "@/lib/page";
import { toolText } from "@/lib/tool-text";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/workflows">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workflowsPage" });
  return pageMetadata(locale, "/workflows", t("metaTitle"), t("subtitle"));
}

export default async function WorkflowsPage({ params }: PageProps<"/[locale]/workflows">) {
  await initPage(params);
  const t = await getTranslations();
  const preview = WORKFLOWS[2];
  const toolT = await getTranslations("tools");
  const toolName = (slug: string) => {
    const tool = findTool(slug);
    return tool ? toolText(toolT, tool).name : slug;
  };
  return (
    <>
      <PageHero
        eyebrow={t("workflowsPage.eyebrow")}
        title={t("workflowsPage.title")}
        subtitle={t("workflowsPage.subtitle")}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("workflowsPage.eyebrow") },
        ]}
        aside={<WorkflowIllustration labels={["OCR", "Compress", "Protect"]} />}
      />
      <Section>
        <Callout tone="info" title={t("workflowsPage.notYet")}>
          {t("workflowsPage.notYetBody")}
        </Callout>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {WORKFLOWS.map((workflow) => (
            <li key={workflow.slug}>
              <WorkflowCard workflow={workflow} />
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="surface" aria-labelledby="builder-heading">
        <SectionHeader
          id="builder-heading"
          eyebrow={<Badge>{t("workflowsPage.notYet")}</Badge>}
          title={t("workflowsPage.builderTitle")}
          subtitle={t("workflowsPage.builderBody")}
        />
        <div
          aria-hidden
          className="relative mt-8 overflow-hidden rounded-(--radius-card) border border-border bg-background bg-grid p-6 shadow-lifted sm:p-10"
        >
          <div className="pointer-events-none flex flex-col items-center gap-4 opacity-90 select-none md:flex-row md:justify-center">
            {preview.steps.map((step, index) => (
              <div key={step.tool} className="flex items-center gap-4 max-md:flex-col">
                <div className="flex w-52 flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-soft">
                  <div className="flex items-center gap-2">
                    <ToolIcon slug={step.tool} size="sm" />
                    <span className="text-sm font-semibold">{toolName(step.tool)}</span>
                  </div>
                  <span className="text-xs text-muted">{step.note}</span>
                </div>
                {index < preview.steps.length - 1 ? (
                  <span className="h-px w-10 bg-primary/50 max-md:h-8 max-md:w-px" />
                ) : null}
              </div>
            ))}
            <span className="flex size-12 items-center justify-center rounded-xl border-2 border-dashed border-border-strong text-muted">
              <Plus className="size-5" />
            </span>
          </div>
          <div className="absolute end-4 bottom-4 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            <MousePointerClick className="size-3.5" />
            <Workflow className="size-3.5" />
            {t("workflowsPage.notYet")}
          </div>
        </div>
      </Section>
    </>
  );
}
