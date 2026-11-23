import { expect, test } from "@playwright/test";

import { makePdf } from "./helpers";

function damagedPdf(label: string, pages: number): Buffer {
  const text = makePdf(label, pages).toString("latin1");
  const shifted = text.replace(
    /(\d{10}) 00000 n/g,
    (_, offset: string) => `${String(Number(offset) + 9).padStart(10, "0")} 00000 n`,
  );
  const garbage = "\n%damaged tail\n" + "\u0000ÿ junk ".repeat(64);
  return Buffer.from(shifted + garbage, "latin1");
}

test("repair a PDF with broken xref offsets and appended garbage", async ({ page }) => {
  await page.goto("/tools/repair");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      { name: "broken.pdf", mimeType: "application/pdf", buffer: damagedPdf("Broken", 3) },
    ]);
  await expect(page.locator("[data-repair-options]")).toBeVisible();
  await expect(page.locator("[data-output-summary]")).toHaveText(
    "Will create the repaired PDF and a repair report",
  );
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  await expect(result.locator("[data-output='broken-repaired.pdf']")).toHaveAttribute(
    "data-pages",
    "3",
  );
  await expect(result.locator("[data-output='repair-report.txt']")).toBeVisible();
});
