import type { Metadata } from "next";

import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";

export function localizedPath(locale: string, path: string): string {
  const normalized = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? normalized || "/" : `/${locale}${normalized}`;
}

export function openGraphFor(
  locale: string,
  path: string,
  title: string,
  description: string,
): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: brand.name,
    title,
    description,
    url: `${siteUrl}${localizedPath(locale, path)}`,
    locale: locale === "ur" ? "ur_PK" : "en_US",
  };
}

export function alternatesFor(locale: string, path: string): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, path),
    languages: Object.fromEntries(
      routing.locales.map((entry) => [entry, `${siteUrl}${localizedPath(entry, path)}`]),
    ),
  };
}
