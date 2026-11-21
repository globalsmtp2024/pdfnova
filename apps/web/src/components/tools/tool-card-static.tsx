"use client";

import { ToolCard } from "@/components/tools/tool-card";
import type { ToolDefinition } from "@/config/tools";
import { useAvailableTools } from "@/lib/session";

export function ToolCardStatic({
  tool,
  layout = "grid",
}: {
  tool: ToolDefinition;
  layout?: "grid" | "list";
}) {
  const available = useAvailableTools();
  const live = Boolean(available.data?.some((entry) => entry.slug === tool.slug));
  return <ToolCard tool={tool} live={live} layout={layout} />;
}
