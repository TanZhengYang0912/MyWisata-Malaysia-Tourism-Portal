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
      "Docs/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
