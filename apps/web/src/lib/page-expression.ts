export type PageExpressionResult =
  | { ok: true; pages: number[] }
  | { ok: false; token: string; reason: "invalid" | "outOfRange" | "empty" | "emptyExclusion" };

const NUMBER = String.raw`(?:\d+|last|end)`;
const RANGE = new RegExp(`^(${NUMBER})?\\s*(-)?\\s*(${NUMBER})?$`, "i");

function resolve(token: string, count: number): number {
  const lowered = token.toLowerCase();
  return lowered === "last" || lowered === "end" ? count : Number.parseInt(token, 10);
}

function expand(token: string, count: number): number[] | PageExpressionResult {
  const lowered = token.toLowerCase();
  if (lowered === "all") return Array.from({ length: count }, (_, index) => index);
  if (lowered === "odd")
    return Array.from({ length: Math.ceil(count / 2) }, (_, index) => index * 2);
  if (lowered === "even")
    return Array.from({ length: Math.floor(count / 2) }, (_, index) => index * 2 + 1);
  const match = RANGE.exec(token);
  if (!match || !(match[1] || match[3])) return { ok: false, token, reason: "invalid" };
  const start = match[1] ? resolve(match[1], count) : 1;
  const openEnd = match[3] ? resolve(match[3], count) : count;
  const end = match[2] ? openEnd : start;
  if ([start, end].some((value) => value < 1 || value > count))
    return { ok: false, token, reason: "outOfRange" };
  const step = end >= start ? 1 : -1;
  const pages: number[] = [];
  for (let value = start; step > 0 ? value <= end : value >= end; value += step)
    pages.push(value - 1);
  return pages;
}

export function parsePageExpression(expression: string, count: number): PageExpressionResult {
  if (count < 1) return { ok: false, token: "", reason: "empty" };
  if (!expression.trim()) return { ok: true, pages: Array.from({ length: count }, (_, i) => i) };
  const included: number[] = [];
  const excluded = new Set<number>();
  let hasInclusion = false;
  for (const raw of expression.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    if (token.startsWith("!")) {
      const target = token.slice(1).trim();
      if (!target) return { ok: false, token, reason: "emptyExclusion" };
      const expanded = expand(target, count);
      if (!Array.isArray(expanded))
        return expanded.ok ? expanded : { ok: false, token, reason: expanded.reason };
      expanded.forEach((page) => excluded.add(page));
      continue;
    }
    hasInclusion = true;
    const expanded = expand(token, count);
    if (!Array.isArray(expanded)) return expanded;
    included.push(...expanded);
  }
  const base = hasInclusion ? included : Array.from({ length: count }, (_, index) => index);
  const pages = base.filter((page) => !excluded.has(page));
  if (!pages.length) return { ok: false, token: expression.trim(), reason: "empty" };
  return { ok: true, pages };
}

export function parsePageSet(expression: string, count: number): Set<number> | null {
  const result = parsePageExpression(expression, count);
  return result.ok ? new Set(result.pages) : null;
}

export function formatPageSet(pages: Iterable<number>): string {
  const ordered = [...new Set(pages)].sort((a, b) => a - b);
  if (!ordered.length) return "";
  const parts: string[] = [];
  let start = ordered[0];
  let previous = start;
  const flush = () =>
    parts.push(start === previous ? `${start + 1}` : `${start + 1}-${previous + 1}`);
  for (const page of ordered.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    flush();
    start = previous = page;
  }
  flush();
  return parts.join(", ");
}
