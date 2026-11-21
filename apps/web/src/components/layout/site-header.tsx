"use client";

import { LayoutDashboard, LogOut, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/layout/logo";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toaster";
import { Link, useRouter } from "@/i18n/navigation";
import { useLogout, useSession } from "@/lib/session";
import { useUi } from "@/stores/ui";

function AccountActions({ stacked = false }: { stacked?: boolean }) {
  const t = useTranslations("common");
  const session = useSession();
  const logout = useLogout();
  const router = useRouter();
  if (session.isPending) return <Skeleton className="h-9 w-36" />;
  if (session.data) {
    return (
      <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-2"}>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <LayoutDashboard aria-hidden />
            {t("dashboard")}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => router.push("/"),
              onError: (error) => toastError(error),
            })
          }
        >
          <LogOut aria-hidden />
          {t("signOut")}
        </Button>
      </div>
    );
  }
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-2"}>
      <Button asChild variant="ghost" size="sm">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
      <Button asChild variant="primary" size="sm">
        <Link href="/tools">{t("getStarted")}</Link>
      </Button>
    </div>
  );
}

export function SiteHeader() {
  const t = useTranslations();
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-glass backdrop-blur-xl">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-white focus:not-sr-only focus:absolute focus:start-3 focus:top-3"
      >
        {t("common.skipToContent")}
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Logo />
          <MegaMenu />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-palette-trigger
            className="hidden h-9 items-center gap-2 rounded-full border border-border bg-surface ps-3 pe-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground sm:flex"
          >
            <Search className="size-4" aria-hidden />
            <span>{t("nav.searchShortcut")}</span>
            <kbd
              className="rounded-md border border-border bg-surface-muted px-1.5 font-mono text-[11px]"
              dir="ltr"
            >
              Ctrl K
            </kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label={t("common.searchTools")}
            onClick={() => setPaletteOpen(true)}
          >
            <Search aria-hidden />
          </Button>
          <ThemeToggle />
          <div className="hidden lg:block">
            <AccountActions />
          </div>
          <MobileNav account={<AccountActions stacked />} />
        </div>
      </div>
    </header>
  );
}
