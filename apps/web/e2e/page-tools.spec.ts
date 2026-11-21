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

const pageOption = (page: Page, number: number) =>
  page.locator(`[role=option][data-page="${number}"]`);

test("rotate selected pages with live preview", async ({ page }) => {
  await page.goto("/tools/rotate");
  await upload(page, [{ name: "turn.pdf", buffer: makePdf("Turn", 3) }]);
  await expect(pageOption(page, 3)).toBeVisible();
  await pageOption(page, 2).click();
  await expect(page.locator("[data-page-range]")).toHaveValue("2");
  await page.getByText("180°", { exact: true }).click();
  await expect(pageOption(page, 2).getByText("180°")).toBeVisible();
  await expect(pageOption(page, 1).getByText("180°")).toHaveCount(0);
  const result = await runTool(page);
  await expect(result.locator("[data-output='turn-rotated.pdf']")).toHaveAttribute(
    "data-pages",
    "3",
  );
});

test("remove pages marked in the grid", async ({ page }) => {
  await page.goto("/tools/remove-pages");
  await upload(page, [{ name: "long.pdf", buffer: makePdf("Long", 5) }]);
  await pageOption(page, 2).click();
  await pageOption(page, 4).click();
  await expect(page.locator("[data-output-summary]")).toHaveText("Removing 2, 3 remain");
  await expect(page.locator("[data-page-range]")).toHaveValue("2, 4");
  const result = await runTool(page);
  await expect(result.locator("[data-output='long-edited.pdf']")).toHaveAttribute(
    "data-pages",
    "3",
  );
});

test("extract typed pages into separate files", async ({ page }) => {
  await page.goto("/tools/extract-pages");
  await upload(page, [{ name: "book.pdf", buffer: makePdf("Book", 4) }]);
  await expect(pageOption(page, 4)).toBeVisible();
  await page.locator("[data-page-range]").fill("1, 3");
  await expect(pageOption(page, 3)).toHaveAttribute("aria-selected", "true");
  await page.getByText("Separate files", { exact: true }).click();
  await expect(page.locator("[data-output-summary]")).toHaveText("Will create 2 files");
  const result = await runTool(page);
  await expect(result.getByRole("link", { name: /Download all/ })).toBeVisible();
  await expect(result.locator("[data-output='book_page-001.pdf']")).toHaveAttribute(
    "data-pages",
    "1",
  );
  await expect(result.locator("[data-output='book_page-003.pdf']")).toHaveAttribute(
    "data-pages",
    "1",
  );
});

test("split at visual split points", async ({ page }) => {
  await page.goto("/tools/split");
  await upload(page, [{ name: "report.pdf", buffer: makePdf("Report", 6) }]);
  await expect(pageOption(page, 6)).toBeVisible();
  await page.locator("[data-split-after='2']").click();
  await page.locator("[data-split-after='4']").click();
  await expect(page.locator("[data-output-summary]")).toHaveText("Will create 3 files");
  await expect(page.locator("#split-ranges")).toHaveValue("1-2\n3-4\n5-6");
  const result = await runTool(page);
  for (const name of [
    "report_part-01_pages-1-2.pdf",
    "report_part-02_pages-3-4.pdf",
    "report_part-03_pages-5-6.pdf",
  ]) {
    await expect(result.locator(`[data-output='${name}']`)).toHaveAttribute("data-pages", "2");
  }
});

test("split every N pages", async ({ page }) => {
  await page.goto("/tools/split");
  await upload(page, [{ name: "deck.pdf", buffer: makePdf("Deck", 5) }]);
  await expect(pageOption(page, 5)).toBeVisible();
  await page.getByText("Every N pages", { exact: true }).click();
  await page.getByLabel("Pages per file").fill("2");
  await expect(page.locator("[data-output-summary]")).toHaveText("Will create 3 files");
  const result = await runTool(page);
  await expect(result.locator("[data-output='deck_part-03_pages-5-5.pdf']")).toHaveAttribute(
    "data-pages",
    "1",
  );
});

test("organize pages across files with undo and keyboard reorder", async ({ page }) => {
  await page.goto("/tools/organize");
  await upload(page, [
    { name: "one.pdf", buffer: makePdf("One", 2) },
    { name: "two.pdf", buffer: makePdf("Two", 1) },
  ]);
  const editor = page.locator("[data-organize-editor]");
  await expect(editor.locator("[data-organize-page]")).toHaveCount(3);
  await editor.locator("[data-organize-page='1'] [aria-pressed]").click();
  await editor.locator("[data-organize-delete]").click();
  await expect(editor.locator("[data-organize-page]")).toHaveCount(2);
  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(editor.locator("[data-organize-page]")).toHaveCount(3);
  await editor.getByRole("button", { name: "Blank page" }).click();
  await expect(editor.locator("[data-organize-page]")).toHaveCount(4);
  const last = editor.locator("[data-organize-page='3'] [aria-pressed]");
  await last.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(/^Over position 3\.$/)).toBeAttached();
  for (const key of ["ArrowLeft", "ArrowLeft", "Space"]) {
    await page.waitForTimeout(250);
    await page.keyboard.press(key);
  }
  await expect(page.getByText(/^Dropped at position 1\.$/)).toBeAttached();
  await expect(page.getByText("Page moved from position 3 to 1")).toBeAttached();
  await expect(editor.getByRole("button", { name: "Position 1: page 1 of two.pdf" })).toBeVisible();
  await expect(page.locator("[data-output-summary]")).toHaveText("4 pages in the new PDF");
  const result = await runTool(page);
  await expect(result.locator("[data-output='organized.pdf']")).toHaveAttribute("data-pages", "4");
});

test("merge result continues into rotate on the server without re-upload", async ({ page }) => {
  await page.goto("/tools/merge");
  await upload(page, [
    { name: "first.pdf", buffer: makePdf("First", 2) },
    { name: "second.pdf", buffer: makePdf("Second", 1) },
  ]);
  const merged = await runTool(page);
  const transfers: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/uploads\/|\/files$|\/download|\/imports$/.test(url))
      transfers.push(`${request.method()} ${url}`);
  });
  const chainResponse = page.waitForResponse(
    (response) => response.url().endsWith("/chain") && response.request().method() === "POST",
  );
  await merged.getByRole("button", { name: /Rotate PDF/ }).click();
  await expect(page).toHaveURL(/\/tools\/rotate$/);
  expect((await chainResponse).status()).toBe(201);
  await expect(page.locator("[data-file-card='merged.pdf']").getByText("3 pages")).toBeVisible();
  await expect(pageOption(page, 3)).toBeVisible();
  const result = await runTool(page);
  await expect(result.locator("[data-output='merged-rotated.pdf']")).toHaveAttribute(
    "data-pages",
    "3",
  );
  expect(transfers.filter((entry) => !entry.includes("/thumbnail"))).toEqual([]);
});

test("password-protected PDF is unlocked for the task only", async ({ page }) => {
  await page.goto("/tools/extract-pages");
  await upload(page, [
    { name: "secret.pdf", buffer: makeEncryptedPdf("Secret", 3, "open-sesame") },
  ]);
  const prompt = page.locator("[data-password-prompt]");
  await expect(prompt).toBeVisible();
  await expect(page.locator("[data-start-tool]")).toBeDisabled();
  await prompt.getByLabel(/password-protected/).fill("wrong-guess");
  await prompt.getByRole("button", { name: "Unlock" }).click();
  await expect(prompt.getByRole("alert")).toHaveText("That password is not correct. Try again.");
  await prompt.getByLabel(/password-protected/).fill("open-sesame");
  await prompt.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("[data-unlocked]")).toBeVisible();
  await expect(pageOption(page, 3)).toBeVisible();
  await pageOption(page, 2).click();
  const result = await runTool(page);
  await expect(result.locator("[data-output='secret-extracted.pdf']")).toHaveAttribute(
    "data-pages",
    "1",
  );
});
