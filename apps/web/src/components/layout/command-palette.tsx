"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, FileText, Keyboard, Languages, Search, SunMoon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { DEVELOPER_LINKS, RESOURCE_LINKS } from "@/config/navigation";
import { TOOLS } from "@/config/tools";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, LOCALES } from "@/i18n/routing";
import { useAvailableTools } from "@/lib/session";
import { toolText } from "@/lib/tool-text";
import { useUi } from "@/stores/ui";

export function CommandPalette() {
  const t = useTranslations();
  const toolT = useTranslations("tools");
  const open = useUi((state) => state.paletteOpen);
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);
  const [query, setQuery] = useState("");
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    setPaletteOpen(next);
  };
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen);
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const available = useAvailableTools();
  const live = new Set(available.data?.map((tool) => tool.slug));

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const item =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-primary-subtle aria-selected:text-foreground";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-floating focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t("palette.title")}</DialogPrimitive.Title>
          <Command label={t("palette.title")} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t("palette.placeholder")}
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              />
              <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted">
                Esc
              </kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                {t("palette.empty", { query })}
              </Command.Empty>
              <Command.Group
                heading={t("palette.tools")}
                className="px-1 pb-2 text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {TOOLS.map((tool) => {
                  const text = toolText(toolT, tool);
                  return (
                    <Command.Item
                      key={tool.slug}
                      value={`${text.name} ${tool.name} ${tool.keywords.join(" ")} ${tool.slug}`}
                      onSelect={() => go(`/tools/${tool.slug}`)}
                      className={item}
                    >
                      <ToolIcon slug={tool.slug} size="sm" />
                      <span className="flex-1 text-foreground">{text.name}</span>
                      {available.isSuccess && !live.has(tool.slug) ? (
                        <span className="text-xs text-muted">{t("common.comingSoon")}</span>
                      ) : null}
                    </Command.Item>
                  );
                })}
              </Command.Group>
              <Command.Group
                heading={t("palette.pages")}
                className="px-1 pb-2 text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {[
                  ...RESOURCE_LINKS.map((link) => ({ ...link, ns: "nav.resourcesItems" })),
                  ...DEVELOPER_LINKS.map((link) => ({ ...link, ns: "nav.developersItems" })),
                ].map((link) => (
                  <Command.Item
                    key={link.href}
                    value={`${t(`${link.ns}.${link.id}.title`)} ${link.href}`}
                    onSelect={() => go(link.href)}
                    className={item}
                  >
                    <link.icon className="size-4 text-muted" aria-hidden />
                    <span className="flex-1 text-foreground">
                      {t(`${link.ns}.${link.id}.title`)}
                    </span>
                  </Command.Item>
                ))}
                <Command.Item
                  value={t("common.allTools")}
                  onSelect={() => go("/tools")}
                  className={item}
                >
                  <FileText className="size-4 text-muted" aria-hidden />
                  <span className="flex-1 text-foreground">{t("common.allTools")}</span>
                </Command.Item>
              </Command.Group>
              <Command.Group
                heading={t("palette.actions")}
                className="px-1 text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                <Command.Item
                  value={t("palette.toggleTheme")}
                  onSelect={() => {
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                    setOpen(false);
                  }}
                  className={item}
                >
                  <SunMoon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1 text-foreground">{t("palette.toggleTheme")}</span>
                </Command.Item>
                {LOCALES.filter((entry) => entry !== locale).map((entry) => (
                  <Command.Item
                    key={entry}
                    value={`${t("language.label")} ${LOCALE_LABELS[entry]} ${entry}`}
                    onSelect={() => {
                      setOpen(false);
                      router.replace(pathname, { locale: entry });
                    }}
                    className={item}
                  >
                    <Languages className="size-4 text-muted" aria-hidden />
                    <span className="flex-1 text-foreground">
                      {t("language.label")}: {LOCALE_LABELS[entry]}
                    </span>
                  </Command.Item>
                ))}
                <Command.Item
                  value={t("shortcuts.title")}
                  onSelect={() => {
                    setOpen(false);
                    setShortcutsOpen(true);
                  }}
                  className={item}
                >
                  <Keyboard className="size-4 text-muted" aria-hidden />
                  <span className="flex-1 text-foreground">{t("shortcuts.title")}</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <CornerDownLeft className="size-3.5" aria-hidden /> {t("common.open")}
              </span>
              <span>{t("palette.shortcutHint", { keys: "Ctrl K" })}</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
