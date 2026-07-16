import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      ".worktrees/**",
      "worktrees/**",
      "tests/e2e/**",
      "scripts/**/*.test.mjs",
      "docs/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
