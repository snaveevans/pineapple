import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns e2e/**. Also ignore agent-harness git worktrees: their
    // duplicated test files have no linked node_modules, so root `vitest run`
    // would otherwise fail to resolve workspace packages. Keep the legacy path
    // for older checkouts.
    exclude: [...configDefaults.exclude, "**/e2e/**", "**/.agents/worktrees/**", "**/.claude/**"],
  },
});
