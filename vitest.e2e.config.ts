import { defineConfig } from "vitest/config";

/** E2E 冒烟专用配置：需要真实 PostgreSQL + Redis（本地 pnpm dev:infra，CI 由服务容器提供）。 */
export default defineConfig({
  test: {
    include: ["**/e2e/**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    // 每个 e2e 文件都在 beforeAll 迁移同一真库，串行避免迁移锁竞争
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
