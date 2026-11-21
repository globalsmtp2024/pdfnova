import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { makePdf } from "./helpers";

const OUT = join(__dirname, "..", "..", "..", "docs", "screenshots", "phase2");

const TOOLS: { slug: string; pages: number; prepare?: string }[] = [
  { slug: "rotate", pages: 6 },
  { slug: "remove-pages", pages: 6 },
  { slug: "extract-pages", pages: 6 },
  { slug: "split", pages: 6 },
  { slug: "organize", pages: 6 },
];

const VARIANTS = [
  { name: "desktop-light", viewport: { width: 1440, height: 1000 }, scheme: "light" as const },
  { name: "desktop-dark", viewport: { width: 1440, height: 1000 }, scheme: "dark" as const },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, scheme: "light" as const },
  {
    name: "mobile-dark-ur",
    viewport: { width: 390, height: 844 },
    scheme: "dark" as const,
    locale: "ur",
  },
];

test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture.");

for (const tool of TOOLS) {
  for (const variant of VARIANTS) {
    test(`${tool.slug} ${variant.name}`, async ({ page }) => {
      mkdirSync(join(OUT, "workspace"), { recursive: true });
      await page.setViewportSize(variant.viewport);
      await page.emulateMedia({ colorScheme: variant.scheme });
      await page.goto(`${variant.locale ? `/${variant.locale}` : ""}/tools/${tool.slug}`);
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles([
          {
            name: "sample.pdf",
            mimeType: "application/pdf",
            buffer: makePdf("Sample", tool.pages),
          },
        ]);
      const ready =
        tool.slug === "organize"
          ? page.locator("[data-organize-page]").nth(tool.pages - 1)
          : page.locator(`[role=option][data-page="${tool.pages}"]`);
      await expect(ready).toBeVisible();
      if (tool.slug !== "organize") {
        await page.locator('[role=option][data-page="2"]').click();
        await page.locator('[role=option][data-page="4"]').click();
      }
      if (tool.slug === "split") await page.locator("[data-split-after='3']").click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT, `${tool.slug}-${variant.name}.png`),
        fullPage: true,
      });
      await page
        .locator("main section")
        .first()
        .screenshot({ path: join(OUT, "workspace", `${tool.slug}-${variant.name}.png`) });
    });
  }
}
