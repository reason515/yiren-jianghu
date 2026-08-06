import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authContexts, envelope, requireAuth, type TokenVerifier } from "./http.js";
import { registerApiStubs } from "./routes.js";

/**
 * API 应用工厂（A5 骨架，B2 扩展：按清单注册全量路由，未实现为 501 stub）。
 * - 依赖注入：deps.readiness 便于测试与后续接入 pg/redis 就绪检查
 * - 请求上下文：requestId 贯穿日志与错误信封（Fastify 内置 requestIdHeader/genReqId）
 * - 鉴权：requireAuth 供受保护路由使用（G3 接入邀请码/微信认证）
 * - 限流骨架：每 IP 令牌桶（占位实现，G3 迁移到 Redis 分布式限流）
 */

export interface AppDeps {
  /** 就绪检查：返回不可用原因列表；空数组表示就绪。 */
  readiness?: () => Promise<string[]>;
}

export interface AppOptions {
  logger?: boolean;
  deps?: AppDeps;
  /** 令牌校验器（A5 占位：非空 token 即视为有效，G3 替换为真实认证）。 */
  verifyToken?: TokenVerifier;
}

const RATE_LIMIT_MAX = 120; // 每分钟每 IP（占位）
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateBucket {
  tokens: number;
  resetAt: number;
}

export async function createApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { deps = {}, verifyToken } = opts;
  const app = Fastify({
    logger: opts.logger ?? false,
    requestIdHeader: "x-request-id",
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  });

  // 限流骨架：每 IP 令牌桶（占位）
  const buckets = new Map<string, RateBucket>();
  app.addHook("onRequest", async (req, reply) => {
    const ip = req.ip;
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { tokens: RATE_LIMIT_MAX, resetAt: now + RATE_LIMIT_WINDOW_MS };
      buckets.set(ip, bucket);
    }
    if (bucket.tokens <= 0) {
      return envelope(reply, 429, "rate_limited", "请求过于频繁，请稍后再试");
    }
    bucket.tokens -= 1;
  });

  // 错误信封
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { code?: unknown; statusCode?: number };
    const message = e instanceof Error ? e.message : "unknown error";
    const code = e.code ? String(e.code) : "internal_error";
    void envelope(reply, e.statusCode ?? 500, code, message);
    req.log.error({ err, url: req.url }, "request failed");
  });

  // 404 信封
  app.setNotFoundHandler((req, reply) => {
    void envelope(reply, 404, "not_found", `未找到资源：${req.method} ${req.url}`);
  });

  // 健康检查
  app.get("/health", async () => ({ status: "ok", service: "api" }));

  // 就绪检查
  app.get("/ready", async (_req, reply) => {
    const reasons = await (deps.readiness?.() ?? Promise.resolve([]));
    if (reasons.length > 0) {
      return envelope(reply, 503, "not_ready", reasons.join("; "));
    }
    return { status: "ready" };
  });

  // 受保护路由示例（验证鉴权链路）
  app.get("/private", { preHandler: requireAuth(verifyToken) }, async (req) => {
    return { accountId: authContexts.get(req)?.accountId };
  });

  // B2：按清单注册全量 API（未实现为 501 stub）
  registerApiStubs(app, verifyToken);

  return app;
}
