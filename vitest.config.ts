import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts", "src/hooks/**/*.ts", "src/components/**/*.tsx"],
      exclude: [
        "src/integrations/**",
        "src/lib/supabase-external.ts",
        "src/components/ui/**",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 10,
        branches: 10,
        functions: 10,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
