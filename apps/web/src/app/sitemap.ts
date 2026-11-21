import type { MetadataRoute } from "next";

import { STATIC_PAGES } from "@/config/navigation";
import { siteUrl, supportEnabled } from "@/config/site";
import { TOOL_CATEGORIES, TOOLS } from "@/config/tools";
import { POSTS } from "@/content/blog/posts";
import { SOLUTIONS } from "@/content/solutions";
import { routing } from "@/i18n/routing";
import { localizedPath } from "@/lib/seo";

export function sitemapPaths(): string[] {
  return [
    ...STATIC_PAGES,
    ...(supportEnabled ? ["/support"] : []),
    ...TOOLS.map((tool) => `/tools/${tool.slug}`),
    ...TOOL_CATEGORIES.map((category) => `/categories/${category.path}`),
    ...SOLUTIONS.map((solution) => `/solutions/${solution.slug}`),
    ...POSTS.map((post) => `/blog/${post.slug}`),
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({
    url: `${siteUrl}${localizedPath(routing.defaultLocale, path)}`,
    changeFrequency: path.startsWith("/blog") || path === "/changelog" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.startsWith("/tools") ? 0.8 : 0.6,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${siteUrl}${localizedPath(locale, path)}`]),
      ),
    },
  }));
}
