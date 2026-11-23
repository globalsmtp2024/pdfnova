import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  describePdfProtection,
  makeEncryptedPdf,
  makeOwnerRestrictedPdf,
  type PdfProtection,
} from "./helpers";

async function upload(page: Page, name: string, buffer: Buffer) {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([{ name, buffer, mimeType: "application/pdf" }]);
}

async function runTool(page: Page): Promise<Locator> {
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled();
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  return result;
}

async function downloadProtection(page: Page, link: Locator): Promise<PdfProtection> {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const address = new URL(href as string, page.url());
  const response = await page.request.get(`${address.pathname}${address.search}`);
  expect(response.ok()).toBe(true);
  return describePdfProtection(await response.body());
}

test("password-protected PDF unlocks only with the correct password", async ({ page }) => {
  await page.goto("/tools/unlock");
  await upload(page, "secret.pdf", makeEncryptedPdf("Secret", 2, "open-sesame"));
  await expect(page.locator("[data-unlock-notice]")).toBeVisible();
  const prompt = page.locator("[data-password-prompt]");
  await expect(prompt).toBeVisible();
  await expect(page.locator("[data-unlock-state='needs-password']")).toBeVisible();
  await expect(page.locator("[data-start-tool]")).toBeDisabled();
  await prompt.getByLabel(/password-protected/).fill("wrong-guess");
  await prompt.getByRole("button", { name: "Unlock" }).click();
  await expect(prompt.getByRole("alert")).toHaveText("That password is not correct. Try again.");
  await prompt.getByLabel(/password-protected/).fill("open-sesame");
  await prompt.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("[data-unlocked]")).toBeVisible();
  await expect(page.locator("[data-unlock-state='password-entered']")).toBeVisible();
  const result = await runTool(page);
  const output = result.locator("[data-output='secret-unlocked.pdf']");
  await expect(output).toHaveAttribute("data-pages", "2");
  expect(await downloadProtection(page, output)).toEqual({
    encrypted: false,
    pages: 2,
    extract: true,
    modify: true,
  });
});

test("owner-restricted PDF runs without a password prompt", async ({ page }) => {
  await page.goto("/tools/unlock");
  await upload(page, "restricted.pdf", makeOwnerRestrictedPdf("Restricted", 3, "owner-only-77"));
  await expect(page.locator("[data-unlock-state='restricted']")).toBeVisible();
  await expect(page.locator("[data-password-prompt]")).toHaveCount(0);
  const result = await runTool(page);
  const output = result.locator("[data-output='restricted-unlocked.pdf']");
  await expect(output).toHaveAttribute("data-pages", "3");
  expect(await downloadProtection(page, output)).toEqual({
    encrypted: false,
    pages: 3,
    extract: true,
    modify: true,
  });
});
