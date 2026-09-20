import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    baseURL: "http://localhost:5273",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // CI installs Playwright's pinned Chromium. Local runs may reuse the
        // system Chrome binary instead of downloading another Chromium build.
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "./e2e/start-api.sh",
      cwd: webRoot,
      url: "http://localhost:8877/health",
      reuseExistingServer: false,
      // A cold disposable D1 store applies the full migration history before
      // Wrangler starts. Keep this above the observed cold-start time in CI.
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      name: "web",
      command:
        "PINEAPPLE_API_PROXY_TARGET=http://localhost:8877 pnpm dev --host localhost --port 5273",
      cwd: webRoot,
      url: "http://localhost:5273",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
