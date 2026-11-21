import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { revealAll } from "./helpers";

const OUTPUT = resolve(__dirname, "../../../docs/screenshots");
const PAGES: [string, string][] = [
  ["home", "/"],
  ["all-tools", "/tools"],
  ["tool-merge", "/tools/merge"],
  ["tool-coming-soon", "/tools/compress"],
  ["category", "/categories/organize"],
  ["features", "/features"],
  ["how-it-works", "/how-it-works"],
  ["security", "/security"],
  ["solutions", "/solutions"],
  ["solution", "/solutions/legal"],
  ["workflows", "/workflows"],
  ["developers", "/developers"],
  ["api-reference", "/developers/api"],
  ["blog", "/blog"],
  ["blog-post", "/blog/what-happens-to-uploaded-files"],
  ["help", "/help"],
  ["contact", "/contact"],
  ["about", "/about"],
  ["changelog", "/changelog"],
  ["status", "/status"],
  ["compare", "/compare"],
  ["legal-privacy", "/legal/privacy"],
  ["accessibility", "/accessibility"],
  ["shortcuts", "/shortcuts"],
  ["dashboard", "/dashboard"],
  ["login", "/auth/login"],
  ["not-found", "/does-not-exist"],
  ["offline", "/offline"],
  ["urdu-home", "/ur"],
  ["urdu-tool", "/ur/tools/merge"],
];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

mkdirSync(OUTPUT, { recursive: true });

for (const theme of ["light", "dark"] as const) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${theme} ${viewportName}`, () => {
      test.use({ colorScheme: theme, viewport });
      for (const [name, path] of PAGES) {
        test(name, async ({ page }) => {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await revealAll(page);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${name} overflows horizontally`).toBeLessThanOrEqual(1);
          await page.screenshot({
            path: resolve(OUTPUT, `${name}-${theme}-${viewportName}.png`),
            fullPage: true,
          });
        });
      }
    });
  }
}
