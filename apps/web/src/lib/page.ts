import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { alternatesFor } from "@/lib/seo";

export async function initPage<T extends { locale: string }>(params: Promise<T>): Promise<T> {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return resolved;
}

export function pageMetadata(
  locale: string,
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    alternates: alternatesFor(locale, path),
    openGraph: { title, description },
  };
}
