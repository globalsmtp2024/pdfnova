import { defineRouting } from "next-intl/routing";

export const LOCALES = ["en", "ur"] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ur"]);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ur: "اردو",
};

export const SCAFFOLD_LOCALES = {
  hi: { label: "हिन्दी", rtl: false },
  ar: { label: "العربية", rtl: true },
  es: { label: "Español", rtl: false },
  fr: { label: "Français", rtl: false },
  de: { label: "Deutsch", rtl: false },
  pt: { label: "Português", rtl: false },
  tr: { label: "Türkçe", rtl: false },
  id: { label: "Bahasa Indonesia", rtl: false },
} as const;

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export function directionFor(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale as Locale) ? "rtl" : "ltr";
}
