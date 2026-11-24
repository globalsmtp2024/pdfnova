"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { Badge } from "@/components/ui/badge";
import { DEVELOPER_LINKS, RESOURCE_LINKS, type NavLink } from "@/config/navigation";
import { isPopular, TOOL_CATEGORIES, TOOLS } from "@/config/tools";
import { NEW_TOOL_SLUGS } from "@/content/changelog";
import { localizedSolution, SOLUTIONS } from "@/content/solutions";
import { Link, usePathname } from "@/i18n/navigation";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { cn } from "@/lib/utils";

type MenuId = "tools" | "solutions" | "developers" | "resources";
const MENUS: MenuId[] = ["tools", "solutions", "developers", "resources"];
const TOOLS_PER_CATEGORY = 4;

function LinkList({
  links,
  namespace,
  onNavigate,
}: {
  links: NavLink[];
  namespace: string;
  onNavigate: () => void;
}) {
  const t = useTranslations(namespace);
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.id}>
          <Link
            href={link.href}
            onClick={onNavigate}
            className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-muted"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <link.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{t(`${link.id}.title`)}</span>
              <span className="block text-xs text-muted">{t(`${link.id}.description`)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ToolsPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const available = useAvailableTools();
  const live = new Set(available.data?.map((tool) => tool.slug));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {TOOL_CATEGORIES.map((category) => {
          const tools = TOOLS.filter((tool) => tool.category === category.id)
            .sort(
              (a, b) =>
                Number(live.has(b.slug)) - Number(live.has(a.slug)) ||
                Number(isPopular(b.slug)) - Number(isPopular(a.slug)),
            )
            .slice(0, TOOLS_PER_CATEGORY);
          return (
            <div key={category.id}>
              <Link
                href={`/categories/${category.path}`}
                onClick={onNavigate}
                className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase hover:text-foreground"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: category.color }}
                />
                {t(`categories.${category.id}.label`)}
              </Link>
              <ul className="flex flex-col gap-0.5">
                {tools.map((tool) => (
                  <li key={tool.slug}>
                    <Link
                      href={`/tools/${tool.slug}`}
                      onClick={onNavigate}
                      className="group flex items-center gap-2.5 rounded-lg p-1.5 text-sm transition-colors hover:bg-surface-muted"
                    >
                      <ToolIcon slug={tool.slug} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{toolText(toolT, tool).name}</span>
                      {live.has(tool.slug) && NEW_TOOL_SLUGS.has(tool.slug) ? (
                        <Badge tone="gradient">{t("common.new")}</Badge>
                      ) : null}
                      {live.has(tool.slug) &&
                      isPopular(tool.slug) &&
                      !NEW_TOOL_SLUGS.has(tool.slug) ? (
                        <Badge tone="primary">{t("common.popular")}</Badge>
                      ) : null}
                      {!live.has(tool.slug) && available.isSuccess ? (
                        <span className="text-xs text-muted">{t("common.comingSoon")}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <p className="text-muted">{t("nav.toolsIntro")}</p>
        <Link
          href="/tools"
          onClick={onNavigate}
          className="font-semibold text-primary hover:underline"
        >
          {t("nav.seeAllTools", { count: TOOLS.length })}
        </Link>
      </div>
    </div>
  );
}

function SolutionsPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("solutionsIntro")}</p>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {SOLUTIONS.map((entry) => localizedSolution(entry, locale)).map((solution) => (
          <li key={solution.slug}>
            <Link
              href={`/solutions/${solution.slug}`}
              onClick={onNavigate}
              className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-muted"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: solution.color }}
              >
                <solution.icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">{solution.title}</span>
                <span className="block text-xs text-muted">{solution.short}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MegaMenu() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState<MenuId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<MenuId, HTMLButtonElement>());
  const panelId = useId();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        triggerRefs.current.get(open)?.focus();
        setOpen(null);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(null);

  return (
    <div ref={rootRef} className="hidden lg:block">
      <nav aria-label={t("tools")} className="flex items-center gap-0.5">
        {MENUS.map((menu) => (
          <button
            key={menu}
            ref={(node) => {
              if (node) triggerRefs.current.set(menu, node);
            }}
            type="button"
            aria-expanded={open === menu}
            aria-controls={`${panelId}-${menu}`}
            onClick={() => setOpen((current) => (current === menu ? null : menu))}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted hover:text-foreground",
              open === menu ? "bg-surface-muted text-foreground" : "text-muted",
            )}
          >
            {t(menu)}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 transition-transform duration-200",
                open === menu && "rotate-180",
              )}
            />
          </button>
        ))}
      </nav>
      {MENUS.map((menu) => (
        <div
          key={menu}
          id={`${panelId}-${menu}`}
          hidden={open !== menu}
          className="absolute inset-x-0 top-full border-b border-border bg-surface/95 shadow-floating backdrop-blur-xl"
        >
          <div className="container-page max-h-[calc(100dvh-5rem)] overflow-y-auto py-6">
            {menu === "tools" ? <ToolsPanel onNavigate={close} /> : null}
            {menu === "solutions" ? <SolutionsPanel onNavigate={close} /> : null}
            {menu === "developers" ? (
              <LinkList
                links={DEVELOPER_LINKS}
                namespace="nav.developersItems"
                onNavigate={close}
              />
            ) : null}
            {menu === "resources" ? (
              <LinkList links={RESOURCE_LINKS} namespace="nav.resourcesItems" onNavigate={close} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
