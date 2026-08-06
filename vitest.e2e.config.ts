import { defineConfig } from "vitest/config";

/** E2E 冒烟专用配置：需要真实 PostgreSQL + Redis（本地 pnpm dev:infra，CI 由服务容器提供）。 */
export default defineConfig({
  test: {
    include: ["**/e2e/**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
