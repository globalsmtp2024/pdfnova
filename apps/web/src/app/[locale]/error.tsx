"use client";

import { RotateCcw, ServerCrash } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusScreen } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <main id="main" className="flex min-h-[70dvh] flex-col">
      <StatusScreen
        icon={ServerCrash}
        code={error.digest ? t("errors.reference", { digest: error.digest }) : "500"}
        title={t("errors.errorTitle")}
        body={t("errors.errorBody")}
        actions={
          <>
            <Button variant="primary" onClick={reset}>
              <RotateCcw aria-hidden />
              {t("common.tryAgain")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t("common.goHome")}</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
