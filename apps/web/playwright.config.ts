import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "3000";
const apiPort = process.env.E2E_API_PORT ?? "8000";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;
const apiPython =
  process.env.E2E_API_PYTHON ??
  resolve(
    __dirname,
    process.platform === "win32" ? "../api/.venv/Scripts/python.exe" : "../api/.venv/bin/python",
  );

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "en-US",
    colorScheme: "light",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `"${apiPython}" -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: "../api",
      url: `http://127.0.0.1:${apiPort}/health/live`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `npx next start -p ${webPort}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
