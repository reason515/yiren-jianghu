import type { FastifyInstance } from "fastify";
import { API_MANIFEST } from "./apiManifest.js";
import { envelope, requireAuth, type TokenVerifier } from "./http.js";

/**
 * 按 API 清单注册未实现路由的 stub（B2）。
 * B/E 阶段按 domain 实现真实路由后（注册进 app），此处因 hasRoute 自动跳过。
 * 未实现接口返回 501 + 统一错误信封，避免"静默空响应"。
 */
export function registerApiStubs(app: FastifyInstance, verifyToken?: TokenVerifier): void {
  for (const route of API_MANIFEST) {
    if (app.hasRoute({ method: route.method, url: route.path })) continue;
    app.route({
      method: route.method,
      url: route.path,
      preHandler: route.auth ? [requireAuth(verifyToken)] : undefined,
      handler: async (req, reply) => {
        void envelope(
          reply,
          501,
          "not_implemented",
          `API ${route.method} ${route.path}（${route.domain}）尚未实现，B/E 阶段落地`,
        );
      },
    });
  }
}
