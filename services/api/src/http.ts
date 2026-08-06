import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * HTTP 基础：错误信封 + 鉴权钩子（独立模块，供 app 与路由注册共用，避免循环引用）。
 */

export interface EnvelopeBody {
  error: { code: string; message: string; requestId: string };
}

export function envelope(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  const requestId = reply.request.id ?? "";
  const body: EnvelopeBody = { error: { code, message, requestId } };
  return reply.status(statusCode).send(body);
}

/** 认证上下文（避免修改 Fastify 请求/回复对象）。 */
export const authContexts = new WeakMap<FastifyRequest, { accountId: string }>();

export type TokenVerifier = (token: string) => Promise<{ accountId: string } | null>;

/** 受保护路由的前置钩子：校验 Bearer token，注入 accountId 到请求上下文。 */
export function requireAuth(verifyToken?: TokenVerifier) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const header = (req.headers.authorization as string | undefined) ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    const account = verifyToken ? await verifyToken(token) : token ? { accountId: "stub" } : null;
    if (!account) return envelope(reply, 401, "unauthorized", "未登录或登录已过期");
    authContexts.set(req, { accountId: account.accountId });
    return undefined;
  };
}
