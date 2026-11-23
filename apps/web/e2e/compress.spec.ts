import { expect, test } from "@playwright/test";

import { makeImagePdf } from "./helpers";

test("compress an image-heavy PDF with the recommended level", async ({ page }) => {
  const original = makeImagePdf("Photo", 2);
  await page.goto("/tools/compress");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([{ name: "photos.pdf", mimeType: "application/pdf", buffer: original }]);
  await page.locator("[data-compress-level='extreme']").click();
  await page.locator("[data-compress-level='recommended']").click();
  await expect(page.locator("[data-compress-level='recommended'] input")).toBeChecked();

  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 90_000 });

  const saved = result.locator("[data-compress-saved]");
  await expect(saved).toContainText("Saved");
  expect(Number(await saved.getAttribute("data-compress-saved"))).toBeGreaterThan(50);
  await expect(result.getByAltText("Before")).toBeVisible();
  await expect(result.getByAltText("After")).toBeVisible();

  const link = result.locator("[data-output='photos-compressed.pdf']");
  await expect(link).toHaveAttribute("data-pages", "2");
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const download = new URL(href ?? "", page.url());
  const response = await page.request.get(`${download.pathname}${download.search}`);
  expect(response.ok()).toBe(true);
  const body = await response.body();
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(body.length).toBeLessThan(original.length / 2);
});
