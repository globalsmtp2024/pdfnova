import { setRequestLocale } from "next-intl/server";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { GlobalOverlays } from "@/components/layout/global-overlays";
import { MobileQuickBar } from "@/components/layout/mobile-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <SiteFooter />
      <MobileQuickBar />
      <GlobalOverlays />
    </>
  );
}
