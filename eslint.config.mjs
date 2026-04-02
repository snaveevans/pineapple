import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/dist/**",
      "eslint.config.mjs",
      "prettier.config.cjs",
      "apps/api/worker-configuration.d.ts",
      ".tmp-api-*/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.serviceworker,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
    },
  },
);
