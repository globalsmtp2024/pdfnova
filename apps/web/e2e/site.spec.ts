import { expect, test } from "@playwright/test";

import { makePdf } from "./helpers";

const PAGES = [
  "/",
  "/tools",
  "/tools/merge",
  "/tools/compress",
  "/categories/organize",
  "/features",
  "/how-it-works",
  "/security",
  "/solutions",
  "/solutions/students",
  "/workflows",
  "/developers",
  "/developers/api",
  "/blog",
  "/blog/page-ranges-explained",
  "/help",
  "/contact",
  "/about",
  "/changelog",
  "/status",
  "/compare",
  "/shortcuts",
  "/accessibility",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/acceptable-use",
  "/dashboard",
  "/settings",
  "/onboarding",
  "/offline",
  "/maintenance",
  "/auth/login",
  "/auth/register",
  "/ur",
  "/ur/tools/merge",
];

test.describe("navigation", () => {
  test("every page renders with a single h1 and no horizontal overflow", async ({ page }) => {
    for (const path of PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("h1").first(), path).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });

  test("unknown routes return 404 on the first request", async ({ page }) => {
    for (const path of [
      `/tools/missing-${Date.now()}`,
      `/nothing-here-${Date.now()}`,
      `/categories/nope-${Date.now()}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByText("This page took a wrong turn")).toBeVisible();
    }
  });

  test("sitemap and robots are served", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain("/tools/merge");
    expect(xml).toContain('hreflang="ur"');
    expect((await request.get("/robots.txt")).ok()).toBeTruthy();
  });
});

test("mega menu opens, lists categories and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Tools", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`#${await trigger.getAttribute("aria-controls")}`);
  await expect(panel.getByRole("link", { name: "Organize" })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Merge PDF/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Solutions", exact: true }).click();
  await page
    .getByRole("link", { name: /Students/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/solutions\/students$/);
});

test("command palette finds and opens a tool", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const input = page.getByPlaceholder("Search tools and pages…");
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press("Control+K");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await input.fill("merge");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tools\/merge$/);
  await expect(page.getByRole("heading", { level: 1, name: "Merge PDF" })).toBeVisible();
});

test("tool search filters the catalog", async ({ page }) => {
  await page.goto("/tools");
  await page.getByRole("searchbox", { name: "Search tools" }).fill("jpg");
  await expect(page.locator("[data-tool-card=image-to-pdf]").first()).toBeVisible();
  await expect(page.locator("[data-tool-card=merge]")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search tools" }).fill("zzzz");
  await expect(page.getByText("No tools match")).toBeVisible();
});

test("theme toggle switches dark mode and persists", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveClass(/(^|\s)light(\s|$)/);
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.reload();
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
});

test("language switcher moves to Urdu with a right-to-left layout", async ({ page }) => {
  await page.goto("/tools/merge");
  await page.locator("[data-language-switcher]").first().selectOption("ur");
  await expect(page).toHaveURL(/\/ur\/tools\/merge$/);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ur");
  await expect(page.getByRole("heading", { level: 1, name: "PDF ضم کریں" })).toBeVisible();
  await page.goto("/ur");
  await expect(page.getByRole("heading", { level: 1, name: /ہر دستاویزی کام،/ })).toBeVisible();
});

test("contact form sends a message", async ({ page }) => {
  await page.goto("/contact");
  const form = page.locator("[data-contact-form]");
  await form.getByLabel("Your name").fill("Playwright Tester");
  await form.getByLabel("Email").fill("tester@example.com");
  await form.getByLabel("Topic").selectOption("feature");
  await form.getByLabel("Message").fill("Please add a dark mode for the PDF viewer.");
  await page.waitForTimeout(3500);
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message sent")).toBeVisible();
});

test("merge flow from upload to download and delete", async ({ page }) => {
  await page.goto("/tools/merge");
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles([
    { name: "alpha.pdf", mimeType: "application/pdf", buffer: makePdf("Alpha", 2) },
    { name: "beta.pdf", mimeType: "application/pdf", buffer: makePdf("Beta", 3) },
  ]);
  await expect(page.locator("[data-file-card]")).toHaveCount(2);
  await expect(page.locator("[data-file-card='beta.pdf']").getByText("3 pages")).toBeVisible();
  await page.getByLabel("Pages to include from beta.pdf").fill("1-2");
  const start = page.locator("[data-start-tool]");
  await expect(start).toBeEnabled();
  await start.click();
  const result = page.locator("[data-result-panel]");
  await expect(result).toBeVisible({ timeout: 45_000 });
  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("link", { name: /Download merged.pdf/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("merged.pdf");
  await result.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByText("These files have been deleted from our servers.")).toBeVisible();
});
