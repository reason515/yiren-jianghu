import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.{ts,tsx}", "!**/e2e/**"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  },
});
