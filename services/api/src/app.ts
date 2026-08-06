import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";

/**
 * API 应用工厂（A5 骨架）。
 * - 依赖注入：deps.readiness 便于测试与后续接入 pg/redis 就绪检查
 * - 请求上下文：requestId 贯穿日志与错误信封（Fastify 内置 requestIdHeader/genReqId）
 * - 鉴权占位：requireAuth 供受保护路由使用（G3 接入邀请码/微信认证）
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
  verifyToken?: (token: string) => Promise<{ accountId: string } | null>;
}

const RATE_LIMIT_MAX = 120; // 每分钟每 IP（占位）
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateBucket {
  tokens: number;
  resetAt: number;
}

/** 认证上下文（避免修改 Fastify 请求/回复对象）。 */
const authContexts = new WeakMap<FastifyRequest, { accountId: string }>();

function envelope(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  const requestId = reply.request.id ?? "";
  return reply.status(statusCode).send({ error: { code, message, requestId } });
}

/** 受保护路由的前置钩子：校验 Bearer token，注入 accountId 到请求上下文。 */
export function requireAuth(verifyToken: AppOptions["verifyToken"]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const header = (req.headers.authorization as string | undefined) ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    const account = verifyToken ? await verifyToken(token) : token ? { accountId: "stub" } : null;
    if (!account) return envelope(reply, 401, "unauthorized", "未登录或登录已过期");
    authContexts.set(req, { accountId: account.accountId });
    return undefined;
  };
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

  return app;
}
