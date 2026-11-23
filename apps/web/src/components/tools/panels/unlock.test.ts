import { describe, expect, it } from "vitest";

import { unlockStatus } from "@/components/tools/panels/unlock";
import type { LocalFile } from "@/components/tools/use-tool-session";

function file(overrides: Partial<LocalFile>): LocalFile {
  return {
    key: "k",
    file: null,
    name: "a.pdf",
    size: 1,
    status: "ready",
    uploaded: 1,
    uploadId: "u",
    pageCount: 1,
    encrypted: false,
    password: "",
    unlocked: false,
    error: null,
    ...overrides,
  };
}

describe("unlockStatus", () => {
  it("asks for a password only when the file needs one to open", () => {
    expect(unlockStatus(file({ encrypted: true }), undefined)).toBe("needs-password");
    expect(unlockStatus(file({ encrypted: true, unlocked: true }), undefined)).toBe(
      "password-entered",
    );
  });

  it("separates owner restrictions from unprotected files", () => {
    expect(unlockStatus(file({}), undefined)).toBe("checking");
    expect(unlockStatus(file({}), true)).toBe("restricted");
    expect(unlockStatus(file({}), false)).toBe("open");
  });
});
