"use client";

import {
  Activity,
  ChartColumn,
  ExternalLink,
  Flag,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { Avatar } from "@/components/admin/admin-ui";
import { LogoMark } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { EmptyState } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLogout, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavItem = { href: string; key: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/tools", key: "tools", icon: ChartColumn },
  { href: "/admin/jobs", key: "jobs", icon: Wrench },
  { href: "/admin/reports", key: "reports", icon: Siren },
  { href: "/admin/settings", key: "settings", icon: Flag },
  { href: "/admin/system", key: "system", icon: Activity },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("adminPanel");
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const signedOut = !session.isPending && !session.data;

  useEffect(() => {
    if (signedOut) router.replace("/admin/login");
  }, [signedOut, router]);

  if (session.isPending || signedOut) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    );
  }

  if (!session.data?.is_admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4">
          <EmptyState icon={ShieldAlert} title={t("noAccessTitle")} body={t("noAccessBody")} />
          <Button
            variant="outline"
            icon={<LogOut />}
            onClick={() =>
              logout.mutate(undefined, { onSettled: () => router.replace("/admin/login") })
            }
          >
            {t("signOut")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[16rem_1fr]" data-admin>
      <aside className="flex flex-col gap-6 border-border bg-surface p-4 max-lg:border-b lg:sticky lg:top-0 lg:h-dvh lg:border-e">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-primary-subtle to-transparent"
        />
        <div className="relative flex items-center gap-2.5">
          <LogoMark />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold">{t("console")}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t("prefix")}
            </span>
          </div>
        </div>
        <nav aria-label={t("console")} className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-cta-gradient text-primary-foreground shadow-soft"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 max-lg:hidden">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-muted p-2.5">
            <Avatar name={session.data.display_name || session.data.email} size="sm" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium">
                {session.data.display_name || session.data.email}
              </span>
              <span className="truncate text-xs text-muted" dir="ltr">
                {session.data.email}
              </span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<LogOut />}
            onClick={() =>
              logout.mutate(undefined, { onSettled: () => router.replace("/admin/login") })
            }
          >
            {t("signOut")}
          </Button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t("backToSite")}
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-glass px-4 backdrop-blur-xl sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("prefix")}
          </span>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("signOut")}
              className="lg:hidden"
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => router.replace("/admin/login") })
              }
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col gap-6 p-4 outline-none sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
