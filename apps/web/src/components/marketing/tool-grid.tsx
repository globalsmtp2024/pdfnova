"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ToolCard } from "@/components/tools/tool-card";
import { CategoryPill } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  searchTools,
  TOOL_CATEGORIES,
  TOOLS,
  type ToolCategoryId,
  type ToolDefinition,
} from "@/config/tools";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";

type Filter = ToolCategoryId | "all";

const COLLAPSED_COUNT = 12;

export function useLocalizedSearch() {
  const toolT = useTranslations("tools");
  return (tools: ToolDefinition[], query: string, category: Filter) => {
    const localized = tools.map((tool) => {
      const text = toolText(toolT, tool);
      return { ...tool, keywords: [...tool.keywords, text.name, text.description] };
    });
    const matches = new Set(searchTools(localized, query, category).map((tool) => tool.slug));
    return tools.filter((tool) => matches.has(tool.slug));
  };
}

export function ToolGrid({ initialCategory = "all" }: { initialCategory?: Filter }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(initialCategory);
  const [expanded, setExpanded] = useState(false);
  const available = useAvailableTools();
  const search = useLocalizedSearch();
  const live = useMemo(() => new Set(available.data?.map((tool) => tool.slug)), [available.data]);

  const results = useMemo(
    () =>
      [...search(TOOLS, query, filter)].sort(
        (a, b) => Number(live.has(b.slug)) - Number(live.has(a.slug)),
      ),
    [filter, live, query, search],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="toolbar"
          aria-label={t("allTools.category")}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <CategoryPill
            label={t("allTools.allCategories")}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {TOOL_CATEGORIES.map((category) => (
            <CategoryPill
              key={category.id}
              label={t(`categories.${category.id}.label`)}
              color={category.color}
              active={filter === category.id}
              onClick={() => setFilter(category.id)}
            />
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            placeholder={t("common.searchPlaceholder")}
            aria-label={t("common.searchTools")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ps-9"
            data-tool-search
          />
        </div>
      </div>
      {available.isPending ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-36" />
            </li>
          ))}
        </ul>
      ) : results.length === 0 ? (
        <div className="rounded-(--radius-card) border border-dashed border-border p-10 text-center">
          <p className="font-medium">{t("home.grid.noResults", { query })}</p>
          <p className="mt-1 text-sm text-muted">{t("home.grid.noResultsHint")}</p>
        </div>
      ) : (
        <>
          <ul
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-live="polite"
          >
            {(expanded || query ? results : results.slice(0, COLLAPSED_COUNT)).map((tool) => (
              <li key={tool.slug}>
                <ToolCard tool={tool} live={live.has(tool.slug)} />
              </li>
            ))}
          </ul>
          {!expanded && !query && results.length > COLLAPSED_COUNT ? (
            <Button variant="outline" className="mx-auto" onClick={() => setExpanded(true)}>
              {t("nav.seeAllTools", { count: results.length })}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
