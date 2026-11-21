import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ToolIcon } from "@/components/tools/tool-icon";
import { Badge } from "@/components/ui/badge";
import { findTool } from "@/config/tools";
import type { WorkflowRecipe } from "@/content/workflows";
import { toolText } from "@/lib/tool-text";

export async function WorkflowCard({ workflow }: { workflow: WorkflowRecipe }) {
  const t = await getTranslations("workflowsPage");
  const toolT = await getTranslations("tools");
  return (
    <article className="gradient-border flex h-full flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 font-semibold">{workflow.title}</h3>
        <Badge>{t("steps", { count: workflow.steps.length })}</Badge>
      </div>
      <p className="text-sm text-muted">{workflow.description}</p>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label={workflow.title}>
        {workflow.steps.map((step, index) => {
          const tool = findTool(step.tool);
          const name = tool ? toolText(toolT, tool).name : step.tool;
          return (
            <li key={`${step.tool}-${index}`} className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 ps-0.5 pe-2.5 text-xs font-medium"
                title={step.note}
              >
                <ToolIcon slug={step.tool} size="sm" />
                {name}
              </span>
              {index < workflow.steps.length - 1 ? (
                <ArrowRight className="flip-rtl size-3.5 text-muted" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted">{t("notYet")}</span>
        <button
          type="button"
          disabled
          aria-disabled
          className="cursor-not-allowed rounded-(--radius-control) border border-border px-3 py-1.5 text-sm font-medium text-muted"
        >
          {t("useWorkflow")}
        </button>
      </div>
    </article>
  );
}
