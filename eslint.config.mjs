import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
);
