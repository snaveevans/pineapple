import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Ignore git worktrees the Claude Code harness creates under .claude/.
    // Their duplicated test files have no linked node_modules, so root
    // `vitest run` would otherwise fail to resolve workspace packages.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
