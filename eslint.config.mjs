import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  // Type-aware linting for TypeScript source files
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Non-type-aware linting for JS config files
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: tseslint.configs.recommended,
  },
  prettier,
);
