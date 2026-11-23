import { expect, test, type Locator, type Page } from "@playwright/test";

import { makeFormPdf, makePdf, readPdfFacts } from "./helpers";

async function upload(page: Page, name: string, buffer: Buffer) {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([{ name, buffer, mimeType: "application/pdf" }]);
}

async function runTool(page: Page): Promise<Locator> {
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  return result;
}

async function download(page: Page, result: Locator, filename: string): Promise<Buffer> {
  const link = result.locator(`[data-output='${filename}']`);
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href as string);
  expect(response.ok()).toBe(true);
  return response.body();
}

async function openWithProperties(page: Page) {
  await page.goto("/tools/edit-metadata");
  await upload(page, "notes.pdf", makePdf("Notes", 2));
  await expect(page.locator("[data-metadata-table]")).toContainText("Found 0 attachments", {
    timeout: 30_000,
  });
}

test("set title and author with a before and after preview", async ({ page }) => {
  await openWithProperties(page);
  await page.locator("[data-metadata-field='title']").fill("Annual review");
  await page.locator("[data-metadata-field='author']").fill("Ayesha Khan");
  await expect(page.locator("[data-metadata-row='title'] [data-after]")).toHaveText(
    "Annual review",
  );
  await expect(page.locator("[data-metadata-row='title'] [data-before]")).toHaveText("—");
  await expect(page.locator("[data-output-summary]")).toHaveText("Changing 2 properties");
  await page.locator("[data-metadata-field='creation_date']").fill("D:20241301000000");
  await expect(page.locator("[data-start-tool]")).toBeDisabled();
  await page.locator("[data-metadata-field='creation_date']").fill("D:20240131093000");
  const result = await runTool(page);
  const facts = readPdfFacts(await download(page, result, "notes-metadata.pdf"));
  expect(facts.info.Title).toBe("Annual review");
  expect(facts.info.Author).toBe("Ayesha Khan");
  expect(facts.info.CreationDate).toBe("D:20240131093000");
  expect(facts.xmp["dc:title"]).toBe("Annual review");
});

test("remove all metadata", async ({ page }) => {
  await page.goto("/tools/edit-metadata");
  await upload(page, "report.pdf", makeFormPdf("Value"));
  await expect(page.locator("[data-metadata-row='producer'] [data-before]")).toContainText(
    "ReportLab",
    { timeout: 30_000 },
  );
  await page.getByLabel("Remove all metadata", { exact: true }).check();
  await expect(page.locator("[data-output-summary]")).toHaveText("Removing all metadata");
  const result = await runTool(page);
  const facts = readPdfFacts(await download(page, result, "report-metadata.pdf"));
  expect(facts.info).toEqual({});
  expect(facts.has_xmp).toBe(false);
});
