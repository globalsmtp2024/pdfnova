import { expect, test } from "@playwright/test";

import { makePdf, readPageBoxes } from "./helpers";

test("crop pages visually with drag, keyboard and typed margins", async ({ page }) => {
  await page.goto("/tools/crop");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([{ name: "scan.pdf", buffer: makePdf("Scan", 2), mimeType: "application/pdf" }]);

  const frame = page.locator("[data-crop-rect]");
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-crop-page='1']")).toHaveText("Page 1 of 2");

  await page.locator('label:has(input[name="crop-unit"][value="pt"])').click();
  const bottom = page.locator("#crop-bottom");
  await expect(bottom).toHaveValue("0");
  const handle = page.locator("[data-crop-handle='s']");
  const box = await handle.boundingBox();
  if (!box) throw new Error("The bottom handle is not visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 6 });
  await page.mouse.up();
  await expect(bottom).not.toHaveValue("0");

  await page.locator("[data-crop-handle='e']").focus();
  for (let step = 0; step < 3; step += 1) await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator("#crop-right")).toHaveValue("30");

  await page.locator("#crop-top").fill("72");
  await page.locator("#crop-left").fill("36");
  await bottom.fill("18");
  await expect(page.locator("[data-crop-mode-hint]")).toContainText("Only the CropBox changes");

  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled();
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  const output = result.locator("[data-output='scan-cropped.pdf']").first();
  await expect(output).toHaveAttribute("data-pages", "2");

  const href = await output.getAttribute("href");
  if (!href) throw new Error("The result has no download link.");
  const response = await page.request.get(href);
  expect(response.ok()).toBe(true);
  const boxes = readPageBoxes(await response.body());
  expect(boxes).toHaveLength(2);
  for (const entry of boxes) {
    expect(entry["/CropBox"]).toEqual([36, 18, 582, 720]);
    expect(entry["/MediaBox"]).toEqual([0, 0, 612, 792]);
  }
});
