import { CircleCheck, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ToolCardStatic } from "@/components/tools/tool-card-static";
import { Accordion } from "@/components/ui/accordion";
import { Section } from "@/components/ui/section";
import { findTool, type ToolDefinition } from "@/config/tools";
import { getToolContent } from "@/content/tools-content";
import { toolText } from "@/lib/tool-text";

export async function ToolLanding({ tool }: { tool: ToolDefinition }) {
  const t = await getTranslations("toolPage");
  const toolT = await getTranslations("tools");
  const content = getToolContent(tool.slug, await getLocale());
  if (!content) return null;
  const name = toolText(toolT, tool).name;
  return (
    <>
      <Section tone="surface" aria-labelledby="howto-heading">
        <h2 id="howto-heading" className="text-h1 font-bold tracking-tight">
          {t("howToTitle", { name })}
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {content.steps.map((step, index) => (
            <li
              key={step}
              className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-background p-6"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-cta-gradient text-sm font-bold text-white">
                {index + 1}
              </span>
              <p className="font-medium">{step}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section aria-labelledby="highlights-heading">
        <h2 id="highlights-heading" className="text-h1 font-bold tracking-tight">
          {t("highlightsTitle", { name })}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.highlights.map((highlight) => (
            <li
              key={highlight.title}
              className="flex flex-col gap-2 rounded-(--radius-card) border border-border bg-surface p-5 shadow-soft"
            >
              <CircleCheck className="size-5 text-success-strong" aria-hidden />
              <h3 className="font-display font-semibold">{highlight.title}</h3>
              <p className="text-sm text-muted">{highlight.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex gap-4 rounded-(--radius-card) border border-success/30 bg-success-subtle p-5">
          <ShieldCheck className="size-6 shrink-0 text-success-strong" aria-hidden />
          <div>
            <h3 className="font-display font-semibold">{t("privacyTitle")}</h3>
            <p className="mt-1 text-sm text-foreground/85">{t("privacyBody")}</p>
          </div>
        </div>
      </Section>
      <Section tone="surface" aria-labelledby="tool-faq-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <h2 id="tool-faq-heading" className="text-h1 font-bold tracking-tight">
            {t("faqTitle", { name })}
          </h2>
          <Accordion
            items={content.faq.map((item, index) => ({
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

export async function RelatedToolsSection({ tool }: { tool: ToolDefinition }) {
  const t = await getTranslations("toolPage");
  const content = getToolContent(tool.slug);
  const related = (content?.related ?? [])
    .map((slug) => findTool(slug))
    .filter((entry): entry is ToolDefinition => entry !== undefined);
  if (!related.length) return null;
  return (
    <Section tone="surface" aria-labelledby="related-heading">
      <h2 id="related-heading" className="text-h2 font-bold">
        {t("relatedTitle")}
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {related.map((entry) => (
          <li key={entry.slug}>
            <ToolCardStatic tool={entry} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
