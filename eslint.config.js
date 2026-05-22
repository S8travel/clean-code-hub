import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `any` đã dọn sạch toàn repo (Mục 5 review code — PR #17/#19/#20/#22-#30).
      // Để `error` để CI chặn mọi `any` mới — code mới buộc dùng type thật,
      // `unknown`, hoặc `Tables<>`/`TablesInsert<>`/`TablesUpdate<>`.
      "@typescript-eslint/no-explicit-any": "error",
      // Cho phép idiom `cond && fn()` và `cond ? a() : b()` dùng như statement.
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
    },
  },
);
