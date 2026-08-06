import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createClient, type RedisClientType } from "redis";
import { runner } from "node-pg-migrate";
import { createApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

/**
 * E2E 冒烟（真实 PostgreSQL + Redis）：
 *   pnpm test:e2e
 * 本地先 pnpm dev:infra（Docker 起 pg/redis），CI 由 e2e 作业的服务容器提供。
 * 覆盖：迁移 → 就绪检查（真实依赖）→ 健康检查 → 鉴权链路 → DB 往返 → Redis 往返。
 * 后续 B/F 阶段在此扩展完整玩法链路（登录→创建→探索→战斗→挂机→断线→恢复→PVP→论坛）。
 */

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

if (!DATABASE_URL) {
  throw new Error(
    "e2e 需要 DATABASE_URL。本地请先执行 pnpm dev:infra 起 PostgreSQL/Redis，再 pnpm test:e2e。",
  );
}

let app: FastifyInstance;
let pool: pg.Pool;
let redis: RedisClientType;

beforeAll(async () => {
  // 1) 迁移到最新（node-pg-migrate 的 runner 是函数而非类；dir 传绝对路径）
  const dbClient = new pg.Client({ connectionString: DATABASE_URL });
  await dbClient.connect();
  await runner({
    dbClient,
    dir: MIGRATIONS_DIR,
    direction: "up",
    migrationsTable: "pgmigrations",
  });
  await dbClient.end();

  // 2) 连接池与 redis
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  redis = createClient({ url: REDIS_URL });
  await redis.connect();

  // 3) 应用工厂：就绪检查接真实依赖
  app = await createApp({
    deps: {
      readiness: async () => {
        const reasons: string[] = [];
        try {
          await pool.query("SELECT 1");
        } catch {
          reasons.push("postgres down");
        }
        try {
          await redis.ping();
        } catch {
          reasons.push("redis down");
        }
        return reasons;
      },
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await redis?.quit();
  await pool?.end();
});

describe("e2e smoke", () => {
  it("/health 返回 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "api" });
  });

  it("/ready 在真实依赖下就绪", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });

  it("鉴权链路：无 token 401，有 token 200", async () => {
    const denied = await app.inject({ method: "GET", url: "/private" });
    expect(denied.statusCode).toBe(401);

    const granted = await app.inject({
      method: "GET",
      url: "/private",
      headers: { authorization: "Bearer e2e-token" },
    });
    expect(granted.statusCode).toBe(200);
    expect(granted.json()).toMatchObject({ accountId: "stub" });
  });

  it("PostgreSQL 往返：迁移已写入 app_meta", async () => {
    const { rows } = await pool.query<{ value: string }>(
      "SELECT value FROM app_meta WHERE key = 'schema_version'",
    );
    expect(rows[0]?.value).toBe("1");
  });

  it("Redis 往返：set/get", async () => {
    await redis.set("e2e:probe", "ok", { EX: 60 });
    expect(await redis.get("e2e:probe")).toBe("ok");
  });
});
