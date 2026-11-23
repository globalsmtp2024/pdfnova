import { describe, expect, it } from "vitest";

import { generatePassword, passwordByteLength, passwordStrength } from "@/lib/password-strength";

describe("passwordStrength", () => {
  it("treats an empty password as empty", () => {
    expect(passwordStrength("")).toEqual({ score: 0, level: "empty", hints: [] });
  });

  it("flags common passwords even with suffixes", () => {
    for (const value of ["password", "Password1", "qwerty123!", "pakistan123"]) {
      const result = passwordStrength(value);
      expect(result.score, value).toBe(0);
      expect(result.hints).toContain("common");
    }
  });

  it("caps short passwords", () => {
    const result = passwordStrength("Ab3$x");
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.hints).toContain("tooShort");
  });

  it("caps repetitive passwords", () => {
    const result = passwordStrength("aaaaaaaaaaaaaaaa");
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.hints).toContain("repetitive");
  });

  it("rewards length and character variety", () => {
    expect(passwordStrength("lowercaseonly").score).toBe(2);
    expect(passwordStrength("Mixed-Case-42x").score).toBeGreaterThanOrEqual(3);
    expect(passwordStrength("T7#kq9!Lm2@vX4$pR8").score).toBe(4);
    expect(passwordStrength("T7#kq9!Lm2@vX4$pR8").level).toBe("veryStrong");
  });

  it("suggests more character classes for simple passwords", () => {
    expect(passwordStrength("onlyletters").hints).toContain("addClasses");
  });
});

describe("generatePassword", () => {
  it("creates strong passwords with every character class", () => {
    for (let run = 0; run < 20; run += 1) {
      const value = generatePassword(20);
      expect(value).toHaveLength(20);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[^A-Za-z0-9]/);
      expect(passwordStrength(value).score).toBe(4);
    }
  });

  it("uses the supplied random source", () => {
    let calls = 0;
    const value = generatePassword(12, (buffer) => {
      calls += 1;
      buffer[0] = 0;
      return buffer;
    });
    expect(value).toHaveLength(12);
    expect(calls).toBeGreaterThanOrEqual(12);
  });

  it("produces different values", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe("passwordByteLength", () => {
  it("counts UTF-8 bytes", () => {
    expect(passwordByteLength("abc")).toBe(3);
    expect(passwordByteLength("پاس")).toBe(6);
  });
});
