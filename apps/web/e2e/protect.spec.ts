import { expect, test, type Page } from "@playwright/test";

import { inspectProtectedPdf, makeEncryptedPdf, makePdf } from "./helpers";

const PASSWORD = "Tangerine-Harbor-74!";

async function upload(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "application/pdf" })));
}

async function setPassword(page: Page, password: string, confirm = password) {
  await page.locator("[data-protect-password]").fill(password);
  await page.locator("[data-protect-confirm]").fill(confirm);
}

async function runAndDownload(page: Page, filename: string): Promise<Buffer> {
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled();
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  const link = result.locator(`[data-output='${filename}']`).first();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(new URL(href as string, page.url()).toString());
  expect(response.ok()).toBe(true);
  return Buffer.from(await response.body());
}

test("protect a PDF with a password and block copying", async ({ page }) => {
  await page.goto("/tools/protect");
  await upload(page, [{ name: "contract.pdf", buffer: makePdf("Contract", 2) }]);
  const start = page.locator("[data-start-tool]");
  await expect(page.locator("[data-protect-panel]")).toBeVisible();
  await expect(page.getByText("Enter an open password.")).toBeVisible();
  await expect(start).toBeDisabled();

  await setPassword(page, PASSWORD, "Tangerine-Harbor");
  await expect(page.getByText("The passwords do not match.").first()).toBeVisible();
  await expect(start).toBeDisabled();

  await page.locator("[data-protect-password]").fill("password1");
  await expect(page.locator("[data-strength]")).toHaveAttribute("data-strength", "veryWeak");
  await setPassword(page, PASSWORD);
  await expect(page.locator("[data-strength]")).not.toHaveAttribute("data-strength", /weak/i);
  await expect(
    page.getByText("We cannot recover a lost password.", { exact: false }),
  ).toBeVisible();

  await page.getByLabel("Copy text and images").uncheck();
  await expect(page.locator("[data-output-summary]")).toHaveText("AES-256, 1 permission blocked");

  const pdf = await runAndDownload(page, "contract-protected.pdf");
  await expect(page.locator("[data-protect-password]")).toHaveCount(0);
  const report = inspectProtectedPdf(pdf, PASSWORD);
  expect(report.opens_without_password).toBe(false);
  expect(report.encrypted).toBe(true);
  expect(report.revision).toBe(6);
  expect(report.pages).toBe(2);
  expect(report.allow.extract).toBe(false);
  expect(report.allow.print_highres).toBe(true);
  expect(report.allow.modify_other).toBe(true);
  expect(() => inspectProtectedPdf(pdf, "wrong-password")).toThrow();
});

test("re-protect an already encrypted PDF after unlocking it", async ({ page }) => {
  await page.goto("/tools/protect");
  await upload(page, [{ name: "old.pdf", buffer: makeEncryptedPdf("Old", 3, "old-secret") }]);
  const prompt = page.locator("[data-password-prompt]");
  await expect(prompt).toBeVisible();
  await prompt.locator("input").fill("old-secret");
  await prompt.getByRole("button").last().click();
  await expect(page.locator("[data-unlocked]")).toBeVisible();

  await page.locator("[data-protect-generate]").click();
  const generated = await page.locator("[data-protect-password]").inputValue();
  expect(generated).toHaveLength(20);
  await expect(page.locator("[data-protect-confirm]")).toHaveValue(generated);
  await expect(page.locator("[data-strength]")).toHaveAttribute("data-strength", "veryStrong");

  const pdf = await runAndDownload(page, "old-protected.pdf");
  const report = inspectProtectedPdf(pdf, generated);
  expect(report.opens_without_password).toBe(false);
  expect(report.pages).toBe(3);
  expect(report.allow.extract).toBe(true);
  expect(() => inspectProtectedPdf(pdf, "old-secret")).toThrow();
});
