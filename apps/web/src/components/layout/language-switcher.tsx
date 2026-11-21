"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <label className={cn("relative inline-flex items-center gap-2 text-sm", className)}>
      <Languages className="pointer-events-none absolute start-3 size-4 text-muted" aria-hidden />
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        disabled={pending}
        data-language-switcher
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(() => router.replace(pathname, { locale: next }));
        }}
        className="h-9 appearance-none rounded-full border border-border bg-surface ps-9 pe-4 text-sm text-foreground hover:border-border-strong"
      >
        {LOCALES.map((entry) => (
          <option key={entry} value={entry} lang={entry}>
            {LOCALE_LABELS[entry]}
          </option>
        ))}
      </select>
    </label>
  );
}
