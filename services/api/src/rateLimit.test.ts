import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { FastifyInstance } from "fastify";

/** 假 Redis：incr 按 key 计数（模拟固定窗口计数）。 */
function fakeRedis() {
  const counts = new Map<string, number>();
  let expired = 0;
  return {
    async incr(key: string): Promise<number> {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    async expire(): Promise<number> {
      expired += 1;
      return 1;
    },
    counts,
    get expired() {
      return expired;
    },
  };
}

describe("Redis 分布式限流（G3）", () => {
  it("注入 redis 时走固定窗口：超过 perMinute 返回 429；第一次触发时设置过期", async () => {
    const redis = fakeRedis();
    const app: FastifyInstance = await createApp({
      deps: { redis: redis as never },
      rateLimit: { perMinute: 2 },
    });
    await app.ready();

    const r1 = await app.inject({ method: "GET", url: "/health" });
    const r2 = await app.inject({ method: "GET", url: "/health" });
    const r3 = await app.inject({ method: "GET", url: "/health" });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r3.statusCode).toBe(429);
    expect((r3.json() as { error: { code: string } }).error.code).toBe("rate_limited");
    expect(redis.expired).toBeGreaterThanOrEqual(1); // 首次 INCR=1 时 EXPIRE 60s
    await app.close();
  });

  it("无 redis 时回退内存桶（行为不变）", async () => {
    const app = await createApp({ rateLimit: { perMinute: 2 } });
    await app.ready();
    const r1 = await app.inject({ method: "GET", url: "/health" });
    const r2 = await app.inject({ method: "GET", url: "/health" });
    const r3 = await app.inject({ method: "GET", url: "/health" });
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(r3.statusCode).toBe(429);
    await app.close();
  });

  it("disableRateLimit 关闭限流（压测专用）", async () => {
    const app = await createApp({ disableRateLimit: true, rateLimit: { perMinute: 1 } });
    await app.ready();
    const r1 = await app.inject({ method: "GET", url: "/health" });
    const r2 = await app.inject({ method: "GET", url: "/health" });
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    await app.close();
  });
});
