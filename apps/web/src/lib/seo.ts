import type { Metadata } from "next";

import { siteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";

export function localizedPath(locale: string, path: string): string {
  const normalized = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? normalized || "/" : `/${locale}${normalized}`;
}

export function alternatesFor(locale: string, path: string): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, path),
    languages: Object.fromEntries(
      routing.locales.map((entry) => [entry, `${siteUrl}${localizedPath(entry, path)}`]),
    ),
  };
}
