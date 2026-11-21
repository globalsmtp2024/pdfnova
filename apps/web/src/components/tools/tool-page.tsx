"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findTool } from "@/config/tools";
import { Link } from "@/i18n/navigation";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";

export function ToolPage({ slug }: { slug: string }) {
  const t = useTranslations("toolPage");
  const toolT = useTranslations("tools");
  const definition = findTool(slug);
  const available = useAvailableTools();
  if (!definition) return null;
  if (available.isPending) return <Skeleton className="mx-auto h-80 w-full max-w-3xl" />;
  const description = available.data?.find((tool) => tool.slug === slug);
  if (available.isError || !description) {
    return (
      <div
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-(--radius-card) border border-dashed border-border-strong bg-surface/70 p-10 text-center"
        data-tool-unavailable
      >
        <h2 className="text-h3 font-semibold">
          {available.isError
            ? t("offlineError")
            : t("unavailableTitle", { name: toolText(toolT, definition).name })}
        </h2>
        {available.isError ? null : <p className="text-muted">{t("unavailableBody")}</p>}
        <Button asChild variant="outline">
          <Link href="/tools">{t("seeAvailable")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <ToolWorkspace
      definition={definition}
      description={description}
      liveTools={new Set(available.data?.map((tool) => tool.slug))}
    />
  );
}

export function LiveGate({ slug, children }: { slug: string; children: ReactNode }) {
  const available = useAvailableTools();
  if (!available.data?.some((tool) => tool.slug === slug)) return null;
  return <>{children}</>;
}
