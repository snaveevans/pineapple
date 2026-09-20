import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns this directory; Vitest must not evaluate its hooks.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
