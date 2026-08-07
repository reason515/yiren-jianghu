import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authContexts, envelope, requireAuth, type TokenVerifier } from "./http.js";
import { registerApiStubs } from "./routes.js";
import { AuthError, createAuthService } from "./authService.js";
import {
  CharacterError,
  createCharacterService,
  type CreateCharacterInput,
} from "./characterService.js";
import { SceneError, buildContentIndex, createSceneService } from "./sceneService.js";
import { SkillsError, createSkillsService } from "./skillsService.js";
import { QuestsError, createQuestsService } from "./questsService.js";
import type { ContentPack } from "@yjh/content";
import type { Db } from "./db.js";

/**
 * API 应用工厂（A5 骨架，B2 清单，M2.5 接入 DB 注入与 auth 域）。
 * - 依赖注入：deps.readiness / deps.db（auth 等业务域真实实现）
 * - 请求上下文：requestId 贯穿日志与错误信封
 * - 鉴权：deps.db 存在时 verifyToken 走 sessions 表；否则保持占位 stub
 * - 限流骨架：每 IP 令牌桶（G3 迁移 Redis）
 */

export interface AppDeps {
  /** 就绪检查：返回不可用原因列表；空数组表示就绪。 */
  readiness?: () => Promise<string[]>;
  /** 数据库（注入后启用真实业务域：auth/character/scene 等）。 */
  db?: Db;
  /** 内容包（注入后启用场景/行囊组装；由部署加载 dev-pack 或线上包）。 */
  content?: ContentPack;
}

export interface AppOptions {
  logger?: boolean;
  deps?: AppDeps;
  /** 邀请码列表（默认取环境变量 INVITE_CODES，逗号分隔）。 */
  inviteCodes?: string[];
  /** 令牌校验器（默认：deps.db 存在时查 sessions；否则占位）。 */
  verifyToken?: TokenVerifier;
}

const RATE_LIMIT_MAX = 120; // 每分钟每 IP（占位）
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateBucket {
  tokens: number;
  resetAt: number;
}

export async function createApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { deps = {} } = opts;
  const db = deps.db;
  const inviteCodes = opts.inviteCodes ?? (process.env.INVITE_CODES ?? "").split(",");
  // 鉴权：显式 verifyToken > db 会话表 > 占位 stub
  const verifyToken =
    opts.verifyToken ?? (db ? createAuthService({ db, inviteCodes }).verifyToken : undefined);
  const auth = db ? createAuthService({ db, inviteCodes }) : null;
  const characters = db ? createCharacterService(db) : null;
  const scene = db && deps.content ? createSceneService(db, buildContentIndex(deps.content)) : null;
  const skills = db && deps.content ? createSkillsService(db, deps.content) : null;
  const quests = db && deps.content ? createQuestsService(db, deps.content) : null;
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

  // M2.5-auth：真实登录（邀请码 → 账号 + 会话 token）；deps.db 未注入时保留 501 stub
  if (auth) {
    app.post("/auth/login", async (req, reply) => {
      const body = (req.body ?? {}) as { inviteCode?: unknown };
      const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
      if (!inviteCode) {
        return envelope(reply, 400, "invalid_request", "缺少邀请帖号");
      }
      try {
        const session = await auth.login(inviteCode);
        return { accountId: session.accountId, token: session.token };
      } catch (err) {
        if (err instanceof AuthError) {
          return envelope(reply, 401, err.code, err.message);
        }
        throw err;
      }
    });
  }

  // M2.5-character：创建/查看/放弃角色（单角色约束 + 30 天冻结语义）；deps.db 未注入时保留 501 stub
  if (characters) {
    app.get("/account", { preHandler: requireAuth(verifyToken) }, async (req) => {
      return { accountId: authContexts.get(req)?.accountId };
    });

    app.post("/characters", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId;
      const body = (req.body ?? {}) as Partial<CreateCharacterInput>;
      try {
        const { characterId } = await characters.createCharacter(accountId ?? "", {
          name: body.name ?? "",
          gender: body.gender === "female" ? "female" : "male",
          attrs: {
            str: Number(body.attrs?.str),
            int: Number(body.attrs?.int),
            con: Number(body.attrs?.con),
            dex: Number(body.attrs?.dex),
          },
        });
        return { characterId };
      } catch (err) {
        if (err instanceof CharacterError) {
          return envelope(reply, 400, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/characters/me", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const character = await characters.getCharacter(accountId);
      if (!character) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return character;
    });

    app.post(
      "/characters/discard",
      { preHandler: requireAuth(verifyToken) },
      async (req, reply) => {
        const accountId = authContexts.get(req)?.accountId ?? "";
        const done = await characters.discardCharacter(accountId);
        if (!done) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
        return { ok: true };
      },
    );
  }

  // M2.5-scene/inventory：场景组装、移动、行囊；deps.db + deps.content 时启用
  if (scene) {
    app.get("/scene", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        const view = await scene.getScene(accountId);
        if (!view) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
        return view;
      } catch (err) {
        if (err instanceof SceneError) return envelope(reply, 404, err.code, err.message);
        throw err;
      }
    });

    app.post("/scene/action", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { type?: string; dir?: string };
      if (body.type !== "move") {
        return envelope(reply, 501, "not_implemented", `动作 ${body.type ?? ""} 尚未实现`);
      }
      try {
        const view = await scene.move(accountId, body.dir ?? "");
        return view;
      } catch (err) {
        if (err instanceof SceneError) {
          const status = err.code === "no_character" ? 404 : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/inventory", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const items = await scene.getInventory(accountId);
      if (!items) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return items;
    });
  }

  // M2.5-skills/quests：武功学习/演练/参悟 + 任务接/交/查；deps.db + deps.content 时启用
  if (skills && quests) {
    app.get("/skills", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const list = await skills.getSkills(accountId);
      if (!list) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return list;
    });

    app.post("/skills/learn", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { skillId?: unknown };
      if (typeof body.skillId !== "string" || !body.skillId) {
        return envelope(reply, 400, "invalid_request", "缺少武功 id");
      }
      try {
        return await skills.learn(accountId, body.skillId);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "no_character" ? 404 : err.code === "skill_not_found" ? 404 : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/skills/practice", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { skillId?: unknown; count?: unknown };
      if (typeof body.skillId !== "string" || !body.skillId) {
        return envelope(reply, 400, "invalid_request", "缺少武功 id");
      }
      const count = typeof body.count === "number" ? body.count : 1;
      try {
        return await skills.practice(accountId, body.skillId, count);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "invalid_count"
              ? 400
              : err.code === "no_character" || err.code === "skill_not_found"
                ? 404
                : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/skills/study", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { skillId?: unknown; count?: unknown };
      if (typeof body.skillId !== "string" || !body.skillId) {
        return envelope(reply, 400, "invalid_request", "缺少武功 id");
      }
      const count = typeof body.count === "number" ? body.count : 1;
      try {
        return await skills.study(accountId, body.skillId, count);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "invalid_count"
              ? 400
              : err.code === "no_character" || err.code === "skill_not_found"
                ? 404
                : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.get("/quests", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const list = await quests.getQuests(accountId);
      if (!list) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return list;
    });

    app.post("/quests/accept", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { questId?: unknown };
      if (typeof body.questId !== "string" || !body.questId) {
        return envelope(reply, 400, "invalid_request", "缺少任务 id");
      }
      try {
        return await quests.acceptQuest(accountId, body.questId);
      } catch (err) {
        if (err instanceof QuestsError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "quest_not_found" ? 404 : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/quests/report", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { questId?: unknown };
      if (typeof body.questId !== "string" || !body.questId) {
        return envelope(reply, 400, "invalid_request", "缺少任务 id");
      }
      try {
        return await quests.reportQuest(accountId, body.questId);
      } catch (err) {
        if (err instanceof QuestsError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "quest_not_found" ? 404 : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });
  }

  // B2：按清单注册全量 API（已实现路由因 hasRoute 自动跳过）
  registerApiStubs(app, verifyToken);

  return app;
}
