import { expect, test, type Locator, type Page } from "@playwright/test";

import { makeFormPdf, readPdfFacts } from "./helpers";

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

test("flatten a filled form so no fields remain", async ({ page }) => {
  await page.goto("/tools/flatten");
  await upload(page, "application.pdf", makeFormPdf("Ayesha Khan"));
  await expect(page.locator("[data-output-summary]")).toContainText("form fields");
  await page.getByLabel("Stamps", { exact: true }).uncheck();
  await expect(page.locator("[data-output-summary]")).not.toContainText("stamps");
  const result = await runTool(page);
  const link = result.locator("[data-output='application-flattened.pdf']");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href as string);
  expect(response.ok()).toBe(true);
  const facts = readPdfFacts(await response.body());
  expect(facts.fields).toBe(0);
  expect(facts.widgets).toBe(0);
  expect(facts.text).toContain("Ayesha Khan");
});

test("flatten needs at least one choice", async ({ page }) => {
  await page.goto("/tools/flatten");
  await upload(page, "application.pdf", makeFormPdf("Value"));
  await page.getByLabel("Form fields", { exact: true }).uncheck();
  await page.getByLabel("Comments and annotations", { exact: true }).uncheck();
  await page.getByLabel("Stamps", { exact: true }).uncheck();
  await expect(page.getByText("Choose at least one thing to flatten.")).toBeVisible();
  await expect(page.locator("[data-start-tool]")).toBeDisabled();
});
