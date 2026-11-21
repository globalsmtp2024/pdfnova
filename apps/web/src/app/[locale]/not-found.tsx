import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/layout/logo";
import { StatusScreen } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations();
  return (
    <main id="main" className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <StatusScreen
        icon={Compass}
        code={t("errors.notFoundCode")}
        title={t("errors.notFoundTitle")}
        body={t("errors.notFoundBody")}
        actions={
          <>
            <Button asChild variant="primary">
              <Link href="/">{t("common.goHome")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tools">{t("common.browseTools")}</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
