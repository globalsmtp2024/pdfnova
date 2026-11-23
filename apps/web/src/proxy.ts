import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { isKnownPath, NOT_FOUND_PATH } from "@/config/routes";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);
const LOCALE_SET = new Set<string>(routing.locales);

export function splitLocale(pathname: string): { locale: string; path: string } {
  const [first, ...rest] = pathname.split("/").filter(Boolean);
  if (first && LOCALE_SET.has(first)) return { locale: first, path: `/${rest.join("/")}` };
  return { locale: routing.defaultLocale, path: pathname || "/" };
}

async function notFoundResponse(request: NextRequest, locale: string): Promise<NextResponse> {
  const target = new URL(`/${locale}${NOT_FOUND_PATH}`, request.url);
  const page = await fetch(target, { headers: { accept: "text/html" }, cache: "no-store" });
  return new NextResponse(page.body, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}

export default async function proxy(request: NextRequest) {
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  if (!isKnownPath(path)) return notFoundResponse(request, locale);
  return intlMiddleware(request);
}

export const config = {
  matcher: "/((?!api|health|docs|openapi\\.json|share-target|_next|_vercel|.*\\..*).*)",
};
