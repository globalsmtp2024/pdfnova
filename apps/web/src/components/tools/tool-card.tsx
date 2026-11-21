"use client";

import { ArrowUpRight, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { Badge } from "@/components/ui/badge";
import { categoryOf, isPopular, type ToolDefinition } from "@/config/tools";
import { NEW_TOOL_SLUGS } from "@/content/changelog";
import { Link } from "@/i18n/navigation";
import { toolText } from "@/lib/tool-text";
import { cn } from "@/lib/utils";
import { useToolPreferences } from "@/stores/tool-preferences";

function trackSpotlight(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}

export function ToolCard({
  tool,
  live,
  layout = "grid",
  showFavorite = true,
  size = "md",
}: {
  tool: ToolDefinition;
  live: boolean;
  layout?: "grid" | "list";
  showFavorite?: boolean;
  size?: "md" | "lg";
}) {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const text = toolText(toolT, tool);
  const favorite = useToolPreferences((state) => state.favorites.includes(tool.slug));
  const toggleFavorite = useToolPreferences((state) => state.toggleFavorite);
  const color = categoryOf(tool.category).color;
  const badges = (
    <span className="flex items-center gap-1.5">
      {!live ? <Badge>{t("common.comingSoon")}</Badge> : null}
      {live && NEW_TOOL_SLUGS.has(tool.slug) ? (
        <Badge tone="gradient">{t("common.new")}</Badge>
      ) : null}
      {live && isPopular(tool.slug) ? <Badge tone="primary">{t("common.popular")}</Badge> : null}
    </span>
  );
  const body = (
    <>
      <div
        className={cn(
          "flex items-start justify-between gap-2",
          layout === "list" && "items-center",
        )}
      >
        <ToolIcon slug={tool.slug} size={size === "lg" ? "lg" : "md"} />
        {layout === "grid" ? badges : null}
      </div>
      <div className={cn("min-w-0", layout === "list" && "flex-1")}>
        <h3
          className={cn(
            "flex items-center gap-1 font-display font-semibold",
            size === "lg" && "text-lg",
          )}
        >
          {text.name}
          {live ? (
            <ArrowUpRight
              aria-hidden
              className="flip-rtl size-4 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          ) : null}
        </h3>
        <p className={cn("mt-1 text-sm text-muted", layout === "list" && "truncate")}>
          {text.description}
        </p>
      </div>
      {layout === "list" ? badges : null}
    </>
  );
  const shell = cn(
    "spotlight gradient-border group relative flex h-full rounded-(--radius-card) border border-border bg-surface p-5 shadow-soft",
    layout === "grid" ? "flex-col gap-4" : "items-center gap-4 pe-12",
    live
      ? "transition-[transform,box-shadow] duration-300 ease-(--ease-spring) hover:-translate-y-1 hover:shadow-lifted"
      : "opacity-70",
  );
  return (
    <div className="relative h-full">
      {live ? (
        <Link
          href={`/tools/${tool.slug}`}
          onMouseMove={trackSpotlight}
          className={shell}
          style={{ ["--spot-color" as string]: color }}
          data-tool-card={tool.slug}
        >
          {body}
        </Link>
      ) : (
        <div aria-disabled className={shell} data-tool-card={tool.slug}>
          {body}
        </div>
      )}
      {showFavorite ? (
        <button
          type="button"
          onClick={() => toggleFavorite(tool.slug)}
          aria-pressed={favorite}
          aria-label={
            favorite
              ? t("allTools.removeFavorite", { name: text.name })
              : t("allTools.addFavorite", { name: text.name })
          }
          className={cn(
            "absolute end-3 bottom-3 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-warning-strong",
            favorite && "text-warning-strong",
            layout === "list" && "top-1/2 bottom-auto -translate-y-1/2",
          )}
        >
          <Star className={cn("size-4", favorite && "fill-current")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
