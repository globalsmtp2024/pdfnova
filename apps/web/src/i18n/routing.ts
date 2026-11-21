import { defineRouting } from "next-intl/routing";

export const LOCALES = ["en", "ur"] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ur"]);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ur: "اردو",
};

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export function directionFor(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale as Locale) ? "rtl" : "ltr";
}
