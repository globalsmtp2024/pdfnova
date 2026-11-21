import type { MetadataRoute } from "next";

import { siteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/dashboard", "/settings", "/onboarding"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
