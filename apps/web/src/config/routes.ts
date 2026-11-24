import { STATIC_PAGES } from "@/config/navigation";
import { CATEGORY_IDS, TOOLS } from "@/config/tools";
import { POSTS } from "@/content/blog/posts";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { SOLUTIONS } from "@/content/solutions";

export const NOT_FOUND_PATH = "/page-not-found";

const EXTRA_PAGES = [
  "/dashboard",
  "/batch",
  "/share",
  "/private",
  "/dashboard/files",
  "/dashboard/teams",
  "/dashboard/webhooks",
  "/admin",
  "/admin/login",
  "/admin/users",
  "/admin/tools",
  "/admin/jobs",
  "/admin/reports",
  "/admin/settings",
  "/admin/system",
  "/dashboard/schedules",
  "/dashboard/signatures",
  "/dashboard/signatures/new",
  "/settings",
  "/onboarding",
  "/offline",
  "/maintenance",
  "/support",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/mfa",
  NOT_FOUND_PATH,
];

const DYNAMIC: Record<string, ReadonlySet<string>> = {
  tools: new Set(TOOLS.map((tool) => tool.slug)),
  categories: new Set(CATEGORY_IDS),
  solutions: new Set(SOLUTIONS.map((solution) => solution.slug)),
  blog: new Set(POSTS.map((post) => post.slug)),
  legal: new Set(LEGAL_DOCUMENTS.map((document) => document.slug)),
};

const DYNAMIC_PATTERNS: readonly RegExp[] = [
  /^\/dashboard\/signatures\/[A-Za-z0-9]{1,64}$/,
  /^\/sign\/[A-Za-z0-9_-]{20,100}$/,
  /^\/dashboard\/teams\/[A-Za-z0-9]{1,64}$/,
  /^\/teams\/accept\/[A-Za-z0-9_-]{20,100}$/,
];

const KNOWN = new Set<string>([...STATIC_PAGES, ...EXTRA_PAGES]);

export function isKnownPath(path: string): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (KNOWN.has(normalized)) return true;
  if (DYNAMIC_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  const values = DYNAMIC[segments[0]];
  if (!values) return false;
  try {
    return values.has(decodeURIComponent(segments[1]));
  } catch {
    return false;
  }
}
