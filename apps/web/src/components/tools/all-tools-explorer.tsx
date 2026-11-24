"use client";

import { Clock, LayoutGrid, List, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useLocalizedSearch } from "@/components/marketing/tool-grid";
import { ToolCard } from "@/components/tools/tool-card";
import { EmptyState } from "@/components/ui/blocks";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FILE_KINDS,
  findTool,
  POPULAR_TOOL_SLUGS,
  PRIVATE_MODE_TOOL_SLUGS,
  TOOL_CATEGORIES,
  TOOLS,
  type FileKind,
  type ToolCategoryId,
  type ToolDefinition,
} from "@/config/tools";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { cn } from "@/lib/utils";
import { useToolPreferences } from "@/stores/tool-preferences";

type Sort = "popular" | "az" | "category";

const selectClass =
  "h-10 rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm";

function popularity(slug: string): number {
  const index = (POPULAR_TOOL_SLUGS as readonly string[]).indexOf(slug);
  return index === -1 ? POPULAR_TOOL_SLUGS.length : index;
}

export function AllToolsExplorer() {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const search = useLocalizedSearch();
  const available = useAvailableTools();
  const live = useMemo(() => new Set(available.data?.map((tool) => tool.slug)), [available.data]);
  const favorites = useToolPreferences((state) => state.favorites);
  const recent = useToolPreferences((state) => state.recent);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategoryId | "all">("all");
  const [format, setFormat] = useState<FileKind | "all">("all");
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("popular");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const results = useMemo(() => {
    const matches = search(TOOLS, query, category).filter(
      (tool) =>
        (format === "all" || tool.accepts.includes(format)) &&
        (!availableOnly || live.has(tool.slug)) &&
        (!offlineOnly || (PRIVATE_MODE_TOOL_SLUGS as readonly string[]).includes(tool.slug)),
    );
    const sorted = [...matches];
    if (sort === "az")
      sorted.sort((a, b) => toolText(toolT, a).name.localeCompare(toolText(toolT, b).name));
    if (sort === "popular") {
      sorted.sort(
        (a, b) =>
          Number(live.has(b.slug)) - Number(live.has(a.slug)) ||
          popularity(a.slug) - popularity(b.slug),
      );
    }
    if (sort === "category") {
      const order = TOOL_CATEGORIES.map((entry) => entry.id);
      sorted.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
    }
    return sorted;
  }, [availableOnly, category, format, live, offlineOnly, query, search, sort, toolT]);

  const shelf = (title: string, icon: typeof Star, slugs: string[]) => {
    const tools = slugs
      .map((slug) => findTool(slug))
      .filter((tool): tool is ToolDefinition => tool !== undefined);
    if (!tools.length) return null;
    const Icon = icon;
    return (
      <section aria-label={title} className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tools.slice(0, 4).map((tool) => (
            <li key={tool.slug}>
              <ToolCard tool={tool} live={live.has(tool.slug)} />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-10">
      {shelf(t("allTools.favorites"), Star, favorites)}
      {shelf(t("allTools.recent"), Clock, recent)}
      <div className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-4 shadow-soft">
        <div className="relative">
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
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("allTools.category")}
            <select
              className={selectClass}
              value={category}
              onChange={(event) => setCategory(event.target.value as ToolCategoryId | "all")}
            >
              <option value="all">{t("allTools.allCategories")}</option>
              {TOOL_CATEGORIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {t(`categories.${entry.id}.label`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("allTools.format")}
            <select
              className={selectClass}
              value={format}
              onChange={(event) => setFormat(event.target.value as FileKind | "all")}
            >
              <option value="all">{t("allTools.allFormats")}</option>
              {FILE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`allTools.formats.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("allTools.sort")}
            <select
              className={selectClass}
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              <option value="popular">{t("allTools.sortPopular")}</option>
              <option value="az">{t("allTools.sortAz")}</option>
              <option value="category">{t("allTools.sortCategory")}</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-4 self-end pb-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-(--primary)"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
              />
              {t("allTools.availableOnly")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-(--primary)"
                checked={offlineOnly}
                onChange={(event) => setOfflineOnly(event.target.checked)}
              />
              {t("allTools.offlineOnly")}
            </label>
          </div>
          <div
            role="radiogroup"
            aria-label={t("allTools.grid")}
            className="ms-auto flex self-end rounded-lg border border-border p-0.5"
          >
            {(["grid", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={layout === mode}
                aria-label={t(`allTools.${mode}`)}
                onClick={() => setLayout(mode)}
                className={cn(
                  "rounded-md p-2",
                  layout === mode
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground",
                )}
              >
                {mode === "grid" ? (
                  <LayoutGrid className="size-4" aria-hidden />
                ) : (
                  <List className="size-4" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {t("allTools.results", { count: results.length })}
      </p>
      {available.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("home.grid.noResults", { query })}
          body={t("home.grid.noResultsHint")}
        />
      ) : (
        <ul
          className={
            layout === "grid"
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col gap-2"
          }
        >
          {results.map((tool) => (
            <li key={tool.slug}>
              <ToolCard tool={tool} live={live.has(tool.slug)} layout={layout} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
