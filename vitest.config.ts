import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Ignore agent-harness git worktrees. Their duplicated test files have no
    // linked node_modules, so root `vitest run` would otherwise fail to resolve
    // workspace packages. Keep the legacy path for older checkouts.
    exclude: [...configDefaults.exclude, "**/.agents/worktrees/**", "**/.claude/**"],
  },
});
