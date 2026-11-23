import { describe, expect, it } from "vitest";

import {
  aspectRect,
  clampRect,
  cropBox,
  displaySize,
  displayToPdfMargins,
  fromPoints,
  hasCrop,
  marginsToRect,
  moveRect,
  pdfToDisplayMargins,
  rectToMargins,
  resizeRect,
  toPoints,
} from "@/lib/crop-math";

const margins = { top: 1, right: 2, bottom: 3, left: 4 };

describe("crop math", () => {
  it("maps displayed margins to unrotated PDF sides like the server", () => {
    expect(displayToPdfMargins(margins, 0)).toEqual(margins);
    expect(displayToPdfMargins(margins, 90)).toEqual({ top: 2, right: 3, bottom: 4, left: 1 });
    expect(displayToPdfMargins(margins, 180)).toEqual({ top: 3, right: 4, bottom: 1, left: 2 });
    expect(displayToPdfMargins(margins, -90)).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
    expect(() => displayToPdfMargins(margins, 45)).toThrow(RangeError);
    for (const rotation of [0, 90, 180, 270])
      expect(pdfToDisplayMargins(displayToPdfMargins(margins, rotation), rotation)).toEqual(
        margins,
      );
  });

  it("computes crop boxes with origin offsets and rotation", () => {
    const page = { x0: 100, y0: 200, x1: 500, y1: 800 };
    const sides = { top: 10, right: 20, bottom: 30, left: 40 };
    expect(cropBox(page, sides, 0)).toEqual({ x0: 140, y0: 230, x1: 480, y1: 790 });
    expect(cropBox(page, sides, 90)).toEqual({ x0: 110, y0: 240, x1: 470, y1: 780 });
    expect(displaySize(page, 270)).toEqual({ width: 600, height: 400 });
    expect(cropBox(page, { top: 300, right: 0, bottom: 300, left: 0 }, 0)).toBeNull();
    expect(cropBox(page, { top: -1, right: 0, bottom: 0, left: 0 }, 0)).toBeNull();
  });

  it("converts units", () => {
    expect(toPoints(25.4, "mm", 0)).toBeCloseTo(72);
    expect(toPoints(1, "in", 0)).toBe(72);
    expect(toPoints(10, "%", 500)).toBe(50);
    expect(fromPoints(72, "mm", 0)).toBeCloseTo(25.4);
    expect(fromPoints(50, "%", 500)).toBe(10);
    expect(fromPoints(50, "%", 0)).toBe(0);
  });

  it("round trips rectangles and margins", () => {
    const size = { width: 600, height: 800 };
    const rect = marginsToRect(size, margins);
    expect(rect).toEqual({ x: 4, y: 1, width: 594, height: 796 });
    expect(rectToMargins(size, rect)).toEqual(margins);
    expect(hasCrop(rectToMargins(size, { x: 0, y: 0, ...size }))).toBe(false);
  });

  it("keeps moves and resizes inside the page", () => {
    const size = { width: 100, height: 200 };
    const rect = { x: 10, y: 10, width: 50, height: 50 };
    expect(moveRect(rect, 100, -100, size)).toEqual({ x: 50, y: 0, width: 50, height: 50 });
    expect(resizeRect(rect, "se", 100, 5, size, null)).toEqual({
      x: 10,
      y: 10,
      width: 90,
      height: 55,
    });
    expect(resizeRect(rect, "w", 60, 0, size, null).width).toBe(1);
    expect(clampRect({ x: -5, y: 190, width: 500, height: 20 }, size)).toEqual({
      x: 0,
      y: 180,
      width: 100,
      height: 20,
    });
  });

  it("locks the aspect ratio while resizing", () => {
    const size = { width: 100, height: 200 };
    const rect = { x: 10, y: 10, width: 40, height: 20 };
    const wider = resizeRect(rect, "e", 20, 0, size, 2);
    expect(wider).toEqual({ x: 10, y: 5, width: 60, height: 30 });
    const corner = resizeRect(rect, "se", 200, 200, size, 2);
    expect(corner.width / corner.height).toBeCloseTo(2);
    expect(corner.x + corner.width).toBeLessThanOrEqual(100);
  });

  it("builds centred paper presets", () => {
    const portrait = aspectRect({ width: 612, height: 792 }, 210 / 297);
    expect(portrait.height).toBe(792);
    expect(portrait.width).toBeCloseTo(792 * (210 / 297));
    expect(portrait.x).toBeCloseTo((612 - portrait.width) / 2);
    const landscape = aspectRect({ width: 792, height: 612 }, 210 / 297);
    expect(landscape.width).toBe(792);
    expect(landscape.height).toBeCloseTo(792 * (210 / 297));
  });
});
