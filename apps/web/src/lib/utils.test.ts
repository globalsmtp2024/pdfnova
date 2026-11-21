import { describe, expect, it } from "vitest";

import { cn, formatBytes, formatDuration, percentSaved } from "@/lib/utils";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [50 * 1024 * 1024, "50 MB"],
    [4 * 1024 ** 3, "4 GB"],
    [-1, "0 B"],
  ])("formats %d as %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [42.4, "42s"],
    [3600, "1 h"],
    [5400, "1 h 30 min"],
    [600, "10 min"],
  ])("formats %d seconds as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe("helpers", () => {
  it("computes savings and merges classes", () => {
    expect(percentSaved(1000, 250)).toBe(75);
    expect(percentSaved(0, 10)).toBe(0);
    expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
  });
});
