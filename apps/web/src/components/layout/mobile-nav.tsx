"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LayoutGrid, Menu, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeSelect } from "@/components/layout/theme-toggle";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { DEVELOPER_LINKS, RESOURCE_LINKS } from "@/config/navigation";
import { findTool, POPULAR_TOOL_SLUGS, TOOL_CATEGORIES } from "@/config/tools";
import { localizedSolution, SOLUTIONS } from "@/content/solutions";
import { Link } from "@/i18n/navigation";
import { toolText } from "@/lib/tool-text";
import { useUi } from "@/stores/ui";

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border py-4">
      <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function MobileNav({ account }: { account: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const linkClass =
    "flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium hover:bg-surface-muted";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.openMenu")}
          className="lg:hidden"
          data-mobile-menu
        >
          <Menu aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 end-0 z-50 flex w-[min(22rem,90vw)] flex-col bg-surface shadow-floating focus:outline-none lg:hidden"
        >
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <DialogPrimitive.Title className="font-display font-semibold">
              {t("common.menu")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.closeMenu")}>
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            <div className="py-4">{account}</div>
            <DrawerSection title={t("nav.tools")}>
              <Link href="/tools" onClick={close} className={linkClass}>
                <LayoutGrid className="size-4 text-primary" aria-hidden />
                {t("common.allTools")}
              </Link>
              {TOOL_CATEGORIES.map((category) => (
                <Link
                  key={category.id}
                  href={`/categories/${category.path}`}
                  onClick={close}
                  className={linkClass}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: category.color }}
                  />
                  {t(`categories.${category.id}.label`)}
                </Link>
              ))}
            </DrawerSection>
            <DrawerSection title={t("nav.solutions")}>
              {SOLUTIONS.map((entry) => localizedSolution(entry, locale)).map((solution) => (
                <Link
                  key={solution.slug}
                  href={`/solutions/${solution.slug}`}
                  onClick={close}
                  className={linkClass}
                >
                  <solution.icon className="size-4" style={{ color: solution.color }} aria-hidden />
                  {solution.title}
                </Link>
              ))}
            </DrawerSection>
            <DrawerSection title={t("nav.developers")}>
              {DEVELOPER_LINKS.map((link) => (
                <Link key={link.id} href={link.href} onClick={close} className={linkClass}>
                  <link.icon className="size-4 text-muted" aria-hidden />
                  {t(`nav.developersItems.${link.id}.title`)}
                </Link>
              ))}
            </DrawerSection>
            <DrawerSection title={t("nav.resources")}>
              {RESOURCE_LINKS.map((link) => (
                <Link key={link.id} href={link.href} onClick={close} className={linkClass}>
                  <link.icon className="size-4 text-muted" aria-hidden />
                  {t(`nav.resourcesItems.${link.id}.title`)}
                </Link>
              ))}
            </DrawerSection>
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <ThemeSelect />
              <LanguageSwitcher />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function MobileQuickBar() {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);
  const slugs = POPULAR_TOOL_SLUGS.slice(0, 4);
  return (
    <nav
      aria-label={t("nav.quickBar")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-5">
        {slugs.map((slug) => {
          const tool = findTool(slug);
          if (!tool) return null;
          return (
            <li key={slug}>
              <Link
                href={`/tools/${slug}`}
                className="group flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium text-muted"
              >
                <ToolIcon slug={slug} size="sm" />
                <span className="w-full truncate text-center">{toolText(toolT, tool).name}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium text-muted"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted">
              <Search className="size-4" aria-hidden />
            </span>
            {t("common.search")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
