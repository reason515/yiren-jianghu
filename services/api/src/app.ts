import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { RedisClientType } from "redis";
import { authContexts, envelope, requireAuth, type TokenVerifier } from "./http.js";
import { registerApiStubs } from "./routes.js";
import { AuthError, createAuthService } from "./authService.js";
import {
  CharacterError,
  createCharacterService,
  type CreateCharacterInput,
} from "./characterService.js";
import {
  SceneError,
  buildContentIndex,
  createSceneService,
  type SceneActionInput,
} from "./sceneService.js";
import { SkillsError, createSkillsService } from "./skillsService.js";
import { QuestsError, createQuestsService } from "./questsService.js";
import { TemplatesError, createTemplatesService } from "./templatesService.js";
import { AfkError, createAfkService } from "./afkService.js";
import { PvpError, createPvpService } from "./pvpService.js";
import { ForumError, createForumService } from "./forumService.js";
import { createSessionService } from "./sessionService.js";
import { CombatError, createCombatService } from "./combatService.js";
import type { ContentPack } from "@yjh/content";
import type { EnableSlot } from "@yjh/game-core";
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
  /** Redis（G3 分布式限流；不注入时回退每进程内存桶）。 */
  redis?: RedisClientType;
}

export interface AppOptions {
  logger?: boolean;
  deps?: AppDeps;
  /** 邀请码列表（默认取环境变量 INVITE_CODES，逗号分隔）。 */
  inviteCodes?: string[];
  /** 令牌校验器（默认：deps.db 存在时查 sessions；否则占位）。 */
  verifyToken?: TokenVerifier;
  /** 压测/测试专用：关闭每 IP 限流（F4 基线测量；生产限流策略随 G3 迁移 Redis 正式化）。 */
  disableRateLimit?: boolean;
  /** 限流覆盖（默认 RATE_LIMIT_PER_MIN env，缺省 120/分钟/IP）。 */
  rateLimit?: { perMinute?: number };
}

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_PER_MIN ?? 120); // 每分钟每 IP（G3 起走 Redis 分布式）
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateBucket {
  tokens: number;
  resetAt: number;
}

export async function createApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { deps = {} } = opts;
  const db = deps.db;
  const inviteCodes = opts.inviteCodes ?? (process.env.INVITE_CODES ?? "").split(",");
  // 鉴权：显式 verifyToken > db 会话表 > 占位 stub；allowAnyInvite 为测试便利（env ALLOW_ANY_INVITE=1，封测前关闭）
  const allowAnyInvite = process.env.ALLOW_ANY_INVITE === "1";
  const verifyToken =
    opts.verifyToken ??
    (db ? createAuthService({ db, inviteCodes, allowAnyInvite }).verifyToken : undefined);
  const auth = db ? createAuthService({ db, inviteCodes, allowAnyInvite }) : null;
  const characters = db ? createCharacterService(db, deps.content) : null;
  const skills = db && deps.content ? createSkillsService(db, deps.content) : null;
  const quests = db && deps.content ? createQuestsService(db, deps.content) : null;
  const scene =
    db && deps.content
      ? createSceneService(db, buildContentIndex(deps.content), quests ?? undefined)
      : null;
  const templates = db && deps.content ? createTemplatesService(db, deps.content) : null;
  const afk = db && deps.content ? createAfkService(db, deps.content) : null;
  const pvp = db && deps.content ? createPvpService(db, deps.content) : null;
  const forum = db ? createForumService(db) : null;
  const session = db ? createSessionService(db, deps.content) : null;
  const combat =
    db && deps.content ? createCombatService(db, deps.content, quests ?? undefined) : null;
  const app = Fastify({
    logger: opts.logger ?? false,
    requestIdHeader: "x-request-id",
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  });

  // 限流：deps.redis 注入时走 Redis 固定窗口（多实例一致）；否则回退每进程内存桶
  const buckets = new Map<string, RateBucket>();
  app.addHook("onRequest", async (req, reply) => {
    if (opts.disableRateLimit) return;
    const ip = req.ip;
    const limit = opts.rateLimit?.perMinute ?? RATE_LIMIT_MAX;
    if (deps.redis) {
      const key = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
      const n = await deps.redis.incr(key);
      if (n === 1) await deps.redis.expire(key, 60);
      if (n > limit) {
        return envelope(reply, 429, "rate_limited", "请求过于频繁，请稍后再试");
      }
      return;
    }
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { tokens: limit, resetAt: now + RATE_LIMIT_WINDOW_MS };
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

  // 内容包版本（deps.content 注入时返回当前包）
  if (deps.content) {
    app.get("/content/version", async () => ({
      version: deps.content!.manifest.version,
      name: deps.content!.manifest.name,
      description: deps.content!.manifest.description,
    }));
  }

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

    app.post("/auth/logout", { preHandler: requireAuth(verifyToken) }, async (req) => {
      const header = req.headers.authorization ?? "";
      const token = header.replace(/^Bearer\s+/i, "");
      await auth.logout(token);
      return { ok: true };
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

    app.put("/characters/name", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { name?: unknown };
      try {
        return await characters.updateName(
          accountId,
          typeof body.name === "string" ? body.name : "",
        );
      } catch (err) {
        if (err instanceof CharacterError)
          return envelope(reply, err.code === "no_character" ? 404 : 409, err.code, err.message);
        throw err;
      }
    });
  }

  // M2.5-scene/inventory：场景组装、移动、行囊；deps.db + deps.content 时启用
  if (scene) {
    app.get("/map", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await scene.getMap(accountId);
      } catch (err) {
        if (err instanceof SceneError) return envelope(reply, 404, err.code, err.message);
        throw err;
      }
    });

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
      const body = (req.body ?? {}) as {
        type?: unknown;
        dir?: unknown;
        targetId?: unknown;
        itemId?: unknown;
        count?: unknown;
      };
      const type = typeof body.type === "string" ? body.type : "";
      try {
        if (type === "move") {
          return await scene.move(accountId, typeof body.dir === "string" ? body.dir : "");
        }
        if (type === "listen_rumor") {
          return await scene.act(accountId, { type: "listen_rumor" });
        }
        if (type === "talk" || type === "take" || type === "trade" || type === "observe") {
          if (typeof body.targetId !== "string" || !body.targetId) {
            return envelope(reply, 400, "invalid_request", "缺少场景目标");
          }
          return await scene.act(accountId, { type, targetId: body.targetId });
        }
        if (type === "buy" || type === "sell") {
          if (
            typeof body.targetId !== "string" ||
            !body.targetId ||
            typeof body.itemId !== "string" ||
            !body.itemId
          ) {
            return envelope(reply, 400, "invalid_request", "缺少交易目标或物品");
          }
          const input: SceneActionInput = {
            type,
            targetId: body.targetId,
            itemId: body.itemId,
            count: typeof body.count === "number" ? body.count : 1,
          };
          return await scene.act(accountId, input);
        }
        return envelope(reply, 400, "invalid_action", "此举尚不能成行");
      } catch (err) {
        if (err instanceof SceneError) {
          const status =
            err.code === "no_character" ||
            err.code === "npc_not_here" ||
            err.code === "npc_not_found" ||
            err.code === "item_not_here" ||
            err.code === "item_not_found"
              ? 404
              : err.code === "item_already_taken" ||
                  err.code === "insufficient_silver" ||
                  err.code === "afk_busy"
                ? 409
                : 400;
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

    app.post("/inventory/equip", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { itemId?: unknown };
      if (typeof body.itemId !== "string" || !body.itemId) {
        return envelope(reply, 400, "invalid_request", "缺少物品 id");
      }
      try {
        return await scene.equip(accountId, body.itemId);
      } catch (err) {
        if (err instanceof SceneError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "item_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/inventory/unequip", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { itemId?: unknown };
      if (typeof body.itemId !== "string" || !body.itemId) {
        return envelope(reply, 400, "invalid_request", "缺少物品 id");
      }
      try {
        return await scene.unequip(accountId, body.itemId);
      } catch (err) {
        if (err instanceof SceneError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "item_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/inventory/use", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { itemId?: unknown };
      if (typeof body.itemId !== "string" || !body.itemId) {
        return envelope(reply, 400, "invalid_request", "缺少物品 id");
      }
      try {
        return await scene.useItem(accountId, body.itemId);
      } catch (err) {
        if (err instanceof SceneError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "item_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
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

    app.get("/skills/mastery", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const mastery = await skills.getMastery(accountId);
      if (!mastery) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return mastery;
    });

    app.get("/skills/teach-offer", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const npcId = (req.query as { npcId?: unknown }).npcId;
      if (typeof npcId !== "string" || !npcId) {
        return envelope(reply, 400, "invalid_request", "缺少师父 id");
      }
      try {
        return await skills.getTeachOffer(accountId, npcId);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "npc_not_found" ? 404 : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/skills/learn", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { skillId?: unknown; npcId?: unknown };
      if (typeof body.skillId !== "string" || !body.skillId) {
        return envelope(reply, 400, "invalid_request", "缺少武功 id");
      }
      if (typeof body.npcId !== "string" || !body.npcId) {
        return envelope(reply, 400, "invalid_request", "缺少师父 id");
      }
      try {
        return await skills.learn(accountId, body.skillId, body.npcId);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "no_character" ||
              err.code === "skill_not_found" ||
              err.code === "npc_not_found"
              ? 404
              : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/skills/enable", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { slot?: unknown; skillId?: unknown };
      if (typeof body.slot !== "string" || !body.slot) {
        return envelope(reply, 400, "invalid_request", "缺少激发槎位");
      }
      if (body.skillId !== null && typeof body.skillId !== "string") {
        return envelope(reply, 400, "invalid_request", "武功 id 须为字符串或 null");
      }
      try {
        return await skills.enable(accountId, {
          slot: body.slot as EnableSlot,
          skillId: body.skillId,
        });
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "skill_not_found" ? 404 : 409,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post(
      "/skills/learn-perform",
      { preHandler: requireAuth(verifyToken) },
      async (req, reply) => {
        const accountId = authContexts.get(req)?.accountId ?? "";
        const body = (req.body ?? {}) as { performId?: unknown; npcId?: unknown };
        if (typeof body.performId !== "string" || !body.performId) {
          return envelope(reply, 400, "invalid_request", "缺少绝招 id");
        }
        if (typeof body.npcId !== "string" || !body.npcId) {
          return envelope(reply, 400, "invalid_request", "缺少师父 id");
        }
        try {
          return await skills.learnPerform(accountId, {
            performId: body.performId,
            npcId: body.npcId,
          });
        } catch (err) {
          if (err instanceof SkillsError)
            return envelope(
              reply,
              err.code === "no_character" ||
                err.code === "perform_not_found" ||
                err.code === "npc_not_found"
                ? 404
                : 409,
              err.code,
              err.message,
            );
          throw err;
        }
      },
    );

    app.post("/skills/apprentice", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { npcId?: unknown };
      if (typeof body.npcId !== "string" || !body.npcId) {
        return envelope(reply, 400, "invalid_request", "缺少师父 id");
      }
      try {
        return await skills.apprentice(accountId, body.npcId);
      } catch (err) {
        if (err instanceof SkillsError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "npc_not_found" ? 404 : 409,
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

    app.post("/skills/exert", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { performId?: unknown };
      if (typeof body.performId !== "string" || !body.performId) {
        return envelope(reply, 400, "invalid_request", "缺少绝招 id");
      }
      try {
        return await skills.exert(accountId, body.performId);
      } catch (err) {
        if (err instanceof SkillsError) {
          const status =
            err.code === "no_character" || err.code === "perform_not_found"
              ? 404
              : err.code === "invalid_request"
                ? 400
                : 409;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/quests", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const overview = await quests.getOverview(accountId);
      if (!overview) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return overview;
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

  // F0 PVE：逐回合持久化；客户端只提交受控意图，绝招/奖励/任务推进均由服务端结算。
  if (combat) {
    app.post("/combat/start", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { targetId?: unknown; targetIds?: unknown };
      const targetIds: string[] = Array.isArray(body.targetIds)
        ? body.targetIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : typeof body.targetId === "string" && body.targetId
          ? [body.targetId]
          : [];
      if (targetIds.length === 0) {
        return envelope(reply, 400, "invalid_request", "缺少交手目标");
      }
      try {
        return await combat.start(accountId, targetIds);
      } catch (err) {
        if (err instanceof CombatError) {
          const status =
            err.code === "no_character" || err.code === "room_not_found"
              ? 404
              : err.code === "combat_in_progress"
                ? 409
                : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.post("/combat/action", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as {
        action?: unknown;
        performId?: unknown;
        targetId?: unknown;
        jiali?: unknown;
      };
      try {
        return await combat.action(accountId, {
          action: typeof body.action === "string" ? body.action : "",
          performId: typeof body.performId === "string" ? body.performId : undefined,
          targetId: typeof body.targetId === "string" ? body.targetId : undefined,
          jiali: typeof body.jiali === "number" ? body.jiali : undefined,
        });
      } catch (err) {
        if (err instanceof CombatError) {
          const status =
            err.code === "no_character" ? 404 : err.code === "combat_not_found" ? 409 : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/combat/status", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        const current = await combat.status(accountId);
        return current ?? { active: false };
      } catch (err) {
        if (err instanceof CombatError && err.code === "no_character") {
          return envelope(reply, 404, err.code, err.message);
        }
        throw err;
      }
    });
  }

  // M2.5-templates/afk：战术模板 CRUD（tactic 校验 + 论剑默认唯一）+ 挂机 start/stop/status/reports；deps.db + deps.content 时启用
  if (templates && afk) {
    app.get("/templates", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const list = await templates.list(accountId);
      if (!list) return envelope(reply, 404, "no_character", "尚未立名闯江湖");
      return list;
    });

    app.post("/templates", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as {
        name?: unknown;
        config?: unknown;
        isDefaultPvp?: unknown;
      };
      try {
        return await templates.create(accountId, {
          name: typeof body.name === "string" ? body.name : "",
          config: body.config as never,
          isDefaultPvp: Boolean(body.isDefaultPvp),
        });
      } catch (err) {
        if (err instanceof TemplatesError)
          return envelope(reply, err.code === "no_character" ? 404 : 400, err.code, err.message);
        throw err;
      }
    });

    app.put("/templates/:id", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as {
        name?: unknown;
        config?: unknown;
        isDefaultPvp?: unknown;
      };
      try {
        return await templates.update(accountId, id, {
          name: typeof body.name === "string" ? body.name : "",
          config: body.config as never,
          isDefaultPvp: Boolean(body.isDefaultPvp),
        });
      } catch (err) {
        if (err instanceof TemplatesError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.delete("/templates/:id", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const { id } = req.params as { id: string };
      try {
        await templates.remove(accountId, id);
        return { ok: true };
      } catch (err) {
        if (err instanceof TemplatesError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/afk/start", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as {
        kind?: unknown;
        presence?: unknown;
        templateId?: unknown;
        durationMinutes?: unknown;
        config?: unknown;
      };
      try {
        return await afk.start(accountId, {
          kind:
            body.kind === "study" ||
            body.kind === "practice" ||
            body.kind === "dazuo" ||
            body.kind === "tuna" ||
            body.kind === "quest" ||
            body.kind === "grind"
              ? body.kind
              : "",
          presence: typeof body.presence === "string" ? body.presence : undefined,
          templateId: typeof body.templateId === "string" ? body.templateId : undefined,
          durationMinutes:
            typeof body.durationMinutes === "number" ? body.durationMinutes : undefined,
          config: (body.config ?? {}) as Record<string, unknown>,
        });
      } catch (err) {
        if (err instanceof AfkError) {
          const status =
            err.code === "no_character" || err.code === "not_found"
              ? 404
              : err.code === "already_running"
                ? 409
                : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.post("/afk/stop", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await afk.stop(accountId);
      } catch (err) {
        if (err instanceof AfkError) {
          const status = err.code === "no_character" ? 404 : err.code === "not_running" ? 409 : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.post("/afk/resume", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await afk.resume(accountId);
      } catch (err) {
        if (err instanceof AfkError) {
          const status =
            err.code === "no_character"
              ? 404
              : err.code === "not_running" || err.code === "not_paused"
                ? 409
                : 400;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/afk/status", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        const view = await afk.status(accountId);
        if (!view) return { active: false };
        return view;
      } catch (err) {
        if (err instanceof AfkError && err.code === "no_character")
          return envelope(reply, 404, "no_character", "尚未立名闯江湖");
        const msg = err instanceof Error ? err.message : "";
        if (/invalid input syntax/i.test(msg)) {
          return envelope(reply, 500, "afk_settle_failed", "行止结算受阻，稍后再试");
        }
        throw err;
      }
    });

    app.get("/afk/reports", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await afk.reports(accountId);
      } catch (err) {
        if (err instanceof AfkError && err.code === "no_character")
          return envelope(reply, 404, "no_character", "尚未立名闯江湖");
        throw err;
      }
    });

    app.get("/afk/grind-jobs", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await afk.grindJobs(accountId);
      } catch (err) {
        if (err instanceof AfkError && err.code === "no_character")
          return envelope(reply, 404, "no_character", "尚未立名闯江湖");
        throw err;
      }
    });
  }

  // M2.5-pvp/leaderboard：赛季/对手/对战（快照模拟 + ELO）+ 榜单；deps.db + deps.content 时启用
  if (pvp) {
    app.get("/pvp/season", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await pvp.getSeason(accountId);
      } catch (err) {
        if (err instanceof PvpError)
          return envelope(reply, err.code === "no_character" ? 404 : 409, err.code, err.message);
        throw err;
      }
    });

    app.get("/pvp/opponents", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      try {
        return await pvp.getOpponents(accountId);
      } catch (err) {
        if (err instanceof PvpError)
          return envelope(reply, err.code === "no_character" ? 404 : 409, err.code, err.message);
        throw err;
      }
    });

    app.post("/pvp/match", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { defenderId?: unknown };
      if (typeof body.defenderId !== "string" || !body.defenderId) {
        return envelope(reply, 400, "invalid_request", "缺少对手 id");
      }
      try {
        return await pvp.startMatch(accountId, body.defenderId);
      } catch (err) {
        if (err instanceof PvpError) {
          const status =
            err.code === "no_character" || err.code === "opponent_not_found" ? 404 : 409;
          return envelope(reply, status, err.code, err.message);
        }
        throw err;
      }
    });

    app.get("/pvp/matches/:id", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const { id } = req.params as { id: string };
      try {
        const match = await pvp.getMatch(accountId, id);
        if (!match) return envelope(reply, 404, "not_found", "此战不在你的剑谱里");
        return match;
      } catch (err) {
        if (err instanceof PvpError)
          return envelope(reply, err.code === "no_character" ? 404 : 409, err.code, err.message);
        throw err;
      }
    });

    app.get("/leaderboard/growth", async () => pvp.growthLeaderboard());
    app.get("/leaderboard/season", async () => pvp.seasonLeaderboard());
  }

  // M2.5-forum：受控纯文本社区（板块/帖/评论/点赞/举报 + 审核状态）；deps.db 时启用（读公开，写需鉴权）
  if (forum) {
    app.get("/forum/sections", async () => forum.sections());
    app.get("/forum/posts", async (req) => {
      const { sectionId } = (req.query ?? {}) as { sectionId?: string };
      return forum.listPosts(sectionId || undefined);
    });
    app.get("/forum/posts/:id", async (req, reply) => {
      const { id } = req.params as { id: string };
      const detail = await forum.getPost(id);
      if (!detail) return envelope(reply, 404, "post_not_found", "这帖子已随风而去");
      return detail;
    });

    app.post("/forum/posts", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { sectionId?: unknown; title?: unknown; body?: unknown };
      try {
        return await forum.createPost(accountId, {
          sectionId: typeof body.sectionId === "string" ? body.sectionId : "",
          title: typeof body.title === "string" ? body.title : "",
          body: typeof body.body === "string" ? body.body : "",
        });
      } catch (err) {
        if (err instanceof ForumError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "section_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post(
      "/forum/posts/:id/comments",
      { preHandler: requireAuth(verifyToken) },
      async (req, reply) => {
        const accountId = authContexts.get(req)?.accountId ?? "";
        const { id } = req.params as { id: string };
        const body = (req.body ?? {}) as { body?: unknown };
        try {
          return await forum.addComment(
            accountId,
            id,
            typeof body.body === "string" ? body.body : "",
          );
        } catch (err) {
          if (err instanceof ForumError)
            return envelope(
              reply,
              err.code === "no_character" || err.code === "post_not_found" ? 404 : 400,
              err.code,
              err.message,
            );
          throw err;
        }
      },
    );

    app.post("/forum/likes", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as { postId?: unknown };
      if (typeof body.postId !== "string" || !body.postId) {
        return envelope(reply, 400, "invalid_request", "缺少帖子 id");
      }
      try {
        return await forum.toggleLike(accountId, body.postId);
      } catch (err) {
        if (err instanceof ForumError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "post_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });

    app.post("/forum/reports", { preHandler: requireAuth(verifyToken) }, async (req, reply) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      const body = (req.body ?? {}) as {
        targetType?: unknown;
        targetId?: unknown;
        reason?: unknown;
      };
      try {
        return await forum.reportPost(accountId, {
          targetType: body.targetType === "comment" ? "comment" : "post",
          targetId: typeof body.targetId === "string" ? body.targetId : "",
          reason: typeof body.reason === "string" ? body.reason : "",
        });
      } catch (err) {
        if (err instanceof ForumError)
          return envelope(
            reply,
            err.code === "no_character" || err.code === "target_not_found" ? 404 : 400,
            err.code,
            err.message,
          );
        throw err;
      }
    });
  }

  // M2.5-session：重连恢复点（stateVersion + 角色快照 + 未读挂机/PVP 战报，返回即置已读）；deps.db 时启用
  if (session) {
    app.get("/session/resume", { preHandler: requireAuth(verifyToken) }, async (req) => {
      const accountId = authContexts.get(req)?.accountId ?? "";
      return session.resume(accountId);
    });
  }

  // B2：按清单注册全量 API（已实现路由因 hasRoute 自动跳过）
  registerApiStubs(app, verifyToken);

  return app;
}
