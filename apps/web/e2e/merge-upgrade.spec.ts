import { expect, test, type Locator, type Page } from "@playwright/test";

import { makeEncryptedPdf, makePdf } from "./helpers";

async function upload(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "application/pdf" })));
}

async function runTool(page: Page): Promise<Locator> {
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled();
  await start.click();
  const result = page.locator("[data-result-panel]:visible");
  await expect(result).toBeVisible({ timeout: 45_000 });
  return result;
}

test("page mode reorders pages across files and deletes one", async ({ page }) => {
  await page.goto("/tools/merge");
  await upload(page, [
    { name: "alpha.pdf", buffer: makePdf("Alpha", 2) },
    { name: "beta.pdf", buffer: makePdf("Beta", 3) },
  ]);
  await expect(page.locator("[data-file-card='beta.pdf']").getByText("3 pages")).toBeVisible();
  await expect(page.locator("[data-file-card='alpha.pdf'] [data-file-thumbnail]")).toBeVisible();
  await expect(page.locator("[data-output-summary]")).toContainText("5 pages, about");
  await page.locator("[data-merge-choice='merge-mode-pages']").click();
  const editor = page.locator("[data-organize-editor]");
  await expect(editor.locator("[data-organize-page]")).toHaveCount(5);
  await expect(page.getByLabel("Pages to include from beta.pdf")).toHaveCount(0);
  await editor.getByRole("button", { name: "Position 3: page 1 of beta.pdf" }).click();
  await editor.locator("#organize-position").fill("1");
  await editor.locator("#organize-position").press("Enter");
  await expect(
    editor.getByRole("button", { name: "Position 1: page 1 of beta.pdf" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Position 2: page 1 of alpha.pdf" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Position 5: page 3 of beta.pdf" }).click();
  await editor.locator("[data-organize-delete]").click();
  await expect(editor.locator("[data-organize-page]")).toHaveCount(4);
  await expect(page.locator("[data-output-summary]")).toContainText("4 pages, about");
  const result = await runTool(page);
  await expect(result.locator("[data-output='merged.pdf']")).toHaveAttribute("data-pages", "4");
});

test("encrypted and plain PDFs merge after the password prompt", async ({ page }) => {
  await page.goto("/tools/merge");
  await upload(page, [
    { name: "locked.pdf", buffer: makeEncryptedPdf("Locked", 2, "merge-secret") },
    { name: "plain.pdf", buffer: makePdf("Plain", 1) },
  ]);
  const prompt = page.locator("[data-password-prompt]");
  await expect(prompt).toBeVisible();
  await expect(page.locator("[data-start-tool]")).toBeDisabled();
  await prompt.getByLabel(/password-protected/).fill("merge-secret");
  await prompt.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("[data-unlocked]")).toBeVisible();
  await expect(page.locator("[data-file-card='locked.pdf']").getByText("2 pages")).toBeVisible();
  await page.locator("[data-merge-choice='merge-bookmarks-perFile']").click();
  const result = await runTool(page);
  await expect(result.locator("[data-output='merged.pdf']")).toHaveAttribute("data-pages", "3");
});
