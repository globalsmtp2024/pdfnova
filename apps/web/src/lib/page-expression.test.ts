import { describe, expect, it } from "vitest";

import { formatPageSet, parsePageExpression, parsePageSet } from "@/lib/page-expression";

function pages(expression: string, count: number): number[] {
  const result = parsePageExpression(expression, count);
  if (!result.ok) throw new Error(`${result.reason}: ${result.token}`);
  return result.pages.map((page) => page + 1);
}

describe("parsePageExpression", () => {
  it("parses ranges, keywords, open ends and reversed ranges", () => {
    expect(pages("1-3, 5", 10)).toEqual([1, 2, 3, 5]);
    expect(pages("8-end", 10)).toEqual([8, 9, 10]);
    expect(pages("last", 10)).toEqual([10]);
    expect(pages("odd", 5)).toEqual([1, 3, 5]);
    expect(pages("even", 5)).toEqual([2, 4]);
    expect(pages("5-3", 10)).toEqual([5, 4, 3]);
    expect(pages("-3", 10)).toEqual([1, 2, 3]);
    expect(pages("  2 - 4 ,, ", 10)).toEqual([2, 3, 4]);
  });

  it("supports exclusions with and without inclusions", () => {
    expect(pages("!3", 5)).toEqual([1, 2, 4, 5]);
    expect(pages("1-5, !2-3", 10)).toEqual([1, 4, 5]);
  });

  it("treats an empty expression as every page", () => {
    expect(pages("", 3)).toEqual([1, 2, 3]);
  });

  it("reports the offending token", () => {
    expect(parsePageExpression("1, 12", 10)).toEqual({
      ok: false,
      token: "12",
      reason: "outOfRange",
    });
    expect(parsePageExpression("abc", 10)).toEqual({ ok: false, token: "abc", reason: "invalid" });
    expect(parsePageExpression("!", 10)).toEqual({
      ok: false,
      token: "!",
      reason: "emptyExclusion",
    });
    expect(parsePageExpression("!1-3", 3)).toMatchObject({ ok: false, reason: "empty" });
    expect(parsePageExpression("!9", 3)).toEqual({ ok: false, token: "!9", reason: "outOfRange" });
  });

  it("handles one-page and very long documents", () => {
    expect(pages("1-end", 1)).toEqual([1]);
    expect(pages("4999-end", 5000)).toEqual([4999, 5000]);
    expect(parsePageSet("odd", 5000)?.size).toBe(2500);
  });
});

describe("formatPageSet", () => {
  it("collapses runs and round-trips through the parser", () => {
    expect(formatPageSet([0, 1, 2, 4, 6, 7])).toBe("1-3, 5, 7-8");
    expect(formatPageSet([])).toBe("");
    const set = new Set([0, 3, 4, 5, 9]);
    expect(parsePageSet(formatPageSet(set), 10)).toEqual(set);
  });
});
