import { Activity, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeSelect } from "@/components/layout/theme-toggle";
import { brand } from "@/config/brand";
import { socialLinks, supportEnabled } from "@/config/site";
import { TOOL_CATEGORIES, TOOLS } from "@/config/tools";
import { Link } from "@/i18n/navigation";
import { toolText } from "@/lib/tool-text";

const TOOLS_PER_COLUMN = 5;

export async function SiteFooter() {
  const t = await getTranslations();
  const toolT = await getTranslations("tools");
  const link = "text-muted transition-colors hover:text-foreground";
  const columns: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: t("footer.product"),
      links: [
        { href: "/tools", label: t("footer.links.allTools") },
        { href: "/features", label: t("footer.links.features") },
        { href: "/workflows", label: t("footer.links.workflows") },
        { href: "/developers", label: t("footer.links.developers") },
        { href: "/developers/api", label: t("footer.links.apiReference") },
        { href: "/compare", label: t("footer.links.compare") },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { href: "/about", label: t("footer.links.about") },
        { href: "/contact", label: t("footer.links.contact") },
        { href: "/changelog", label: t("footer.links.changelog") },
        { href: "/roadmap", label: t("footer.links.roadmap") },
        ...(supportEnabled ? [{ href: "/support", label: t("footer.links.support") }] : []),
      ],
    },
    {
      title: t("footer.resources"),
      links: [
        { href: "/blog", label: t("footer.links.blog") },
        { href: "/help", label: t("footer.links.help") },
        { href: "/how-it-works", label: t("footer.links.howItWorks") },
        { href: "/security", label: t("footer.links.security") },
        { href: "/shortcuts", label: t("footer.links.shortcuts") },
        { href: "/accessibility", label: t("footer.links.accessibility") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/legal/terms", label: t("footer.links.terms") },
        { href: "/legal/privacy", label: t("footer.links.privacy") },
        { href: "/legal/cookies", label: t("footer.links.cookies") },
        { href: "/legal/acceptable-use", label: t("footer.links.acceptableUse") },
      ],
    },
  ];
  return (
    <footer className="mt-auto border-t border-border bg-surface pb-20 render-deferred md:pb-0">
      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2.8fr]">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="max-w-xs text-sm text-muted">{t("footer.tagline")}</p>
            <p className="flex max-w-xs items-start gap-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden />
              {t("footer.privacyNote")}
            </p>
            <Link
              href="/status"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground"
            >
              <Activity className="size-3.5 text-success-strong" aria-hidden />
              {t("footer.status")}
            </Link>
            {socialLinks.length ? (
              <div>
                <h2 className="mb-2 text-sm font-semibold">{t("footer.social")}</h2>
                <ul className="flex flex-wrap gap-3 text-sm">
                  {socialLinks.map((social) => (
                    <li key={social.id}>
                      <a
                        href={social.href}
                        rel="me noopener noreferrer"
                        target="_blank"
                        className={link}
                      >
                        {social.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
                <ul className="flex flex-col gap-2 text-sm">
                  {column.links.map((entry) => (
                    <li key={entry.href}>
                      <Link href={entry.href} className={link}>
                        {entry.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 grid gap-8 border-t border-border pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {TOOL_CATEGORIES.map((category) => (
            <div key={category.id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: category.color }}
                />
                <Link href={`/categories/${category.path}`} className="hover:text-primary">
                  {t(`categories.${category.id}.label`)}
                </Link>
              </h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {TOOLS.filter((tool) => tool.category === category.id)
                  .slice(0, TOOLS_PER_COLUMN)
                  .map((tool) => (
                    <li key={tool.slug}>
                      <Link href={`/tools/${tool.slug}`} className={link}>
                        {toolText(toolT, tool).name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-4 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
          <p>{t("footer.rights", { brand: brand.name })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <ThemeSelect />
          </div>
        </div>
      </div>
    </footer>
  );
}
