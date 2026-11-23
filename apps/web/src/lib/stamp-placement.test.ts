import { describe, expect, it } from "vitest";

import {
  anchorCenter,
  formatNumber,
  mirrored,
  numberedPages,
  pageLabel,
  rotatedExtent,
  templateProblem,
  tileCenters,
  toLetters,
  toRoman,
  toScreen,
  visualPageSize,
} from "@/lib/stamp-placement";

const page = { width: 600, height: 800 };
const box = { width: 40, height: 10 };

describe("anchor placement", () => {
  it("matches the server's anchor math", () => {
    expect(anchorCenter("bottom-left", page, box, 30, 20)).toEqual({ x: 50, y: 25 });
    expect(anchorCenter("top-right", page, box, 30, 20)).toEqual({ x: 550, y: 775 });
    expect(anchorCenter("bottom-center", page, box, 30, 20)).toEqual({ x: 300, y: 25 });
    expect(anchorCenter("middle-center", page, box, 30, 20, 5, -5)).toEqual({ x: 305, y: 395 });
  });

  it("mirrors only horizontal positions", () => {
    expect(mirrored("bottom-left")).toBe("bottom-right");
    expect(mirrored("top-right")).toBe("top-left");
    expect(mirrored("middle-center")).toBe("middle-center");
  });

  it("converts to screen pixels with a top-left origin", () => {
    expect(toScreen({ x: 300, y: 25 }, page, 0.5)).toEqual({ left: 150, top: 387.5 });
  });

  it("swaps sides for rotated pages", () => {
    expect(visualPageSize(595, 842, 90)).toEqual({ width: 842, height: 595 });
    expect(visualPageSize(595, 842, -90)).toEqual({ width: 842, height: 595 });
    expect(visualPageSize(595, 842, 180)).toEqual({ width: 595, height: 842 });
  });
});

describe("tiling", () => {
  it("measures rotated boxes", () => {
    const extent = rotatedExtent(100, 20, 90);
    expect(extent.width).toBeCloseTo(20);
    expect(extent.height).toBeCloseTo(100);
  });

  it("covers the whole page and respects the limit", () => {
    const centers = tileCenters(page, { width: 100, height: 20 }, 45, 50, 2500);
    expect(Math.min(...centers.map((point) => point.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...centers.map((point) => point.x))).toBeGreaterThanOrEqual(600);
    expect(Math.max(...centers.map((point) => point.y))).toBeGreaterThanOrEqual(800);
    expect(
      tileCenters({ width: 1e6, height: 1e6 }, { width: 10, height: 10 }, 0, 0, 500).length,
    ).toBeLessThanOrEqual(500);
  });
});

describe("labels", () => {
  it("formats numbers like the server", () => {
    expect(toRoman(1994)).toBe("MCMXCIV");
    expect(toRoman(0)).toBe("0");
    expect(toLetters(27)).toBe("AA");
    expect(toLetters(52)).toBe("AZ");
    expect(formatNumber(4, "roman_lower", "western")).toBe("iv");
    expect(formatNumber(120, "decimal", "arabic_indic")).toBe("١٢٠");
    expect(formatNumber(45, "decimal", "extended_arabic_indic")).toBe("۴۵");
  });

  it("builds labels from formats and templates", () => {
    expect(pageLabel("page_n_of_total", "", "decimal", "western", 2, 3)).toBe("Page 2 of 3");
    expect(pageLabel("custom", "صفحہ {n}", "decimal", "extended_arabic_indic", 7, 9)).toBe(
      "صفحہ ۷",
    );
  });

  it("validates templates", () => {
    expect(templateProblem("{n} of {total}")).toBeNull();
    expect(templateProblem("{x}")).toBe("fields");
    expect(templateProblem("{total}")).toBe("missing");
    expect(templateProblem("{n")).toBe("braces");
  });

  it("applies skip rules", () => {
    const base = {
      startNumber: 5,
      firstPage: 1,
      skipFirst: 1,
      skipLast: 1,
      parity: "all" as const,
      pages: null,
    };
    expect(numberedPages(base, 5)).toEqual([
      { index: 1, number: 5, total: 7 },
      { index: 2, number: 6, total: 7 },
      { index: 3, number: 7, total: 7 },
    ]);
    expect(
      numberedPages(
        { ...base, skipFirst: 0, skipLast: 0, startNumber: 1, parity: "odd", firstPage: 2 },
        6,
      ).map((entry) => entry.index),
    ).toEqual([2, 4]);
  });
});
