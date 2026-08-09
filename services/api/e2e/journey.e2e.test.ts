import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createClient, type RedisClientType } from "redis";
import { runner } from "node-pg-migrate";
import { loadContentDir } from "@yjh/content";
import { settleDueJobs } from "@yjh/worker";
import { createApp } from "../src/app.js";
import { createPgDb } from "../src/db.js";
import type { FastifyInstance } from "fastify";

/**
 * F3 端到端全链路（真实 PostgreSQL + Redis + dev-pack 内容包）：
 *   登录 → 建角 → 恢复点 → 场景探索 → 学武/演练/参悟 → 任务 → 挂机 →
 *   PVP → 断线恢复（未读战报）→ 装备/使用 → 论坛 → 登出。
 * 真实注入 deps.db / deps.content / inviteCodes，40 路由协同走通。
 *
 * SQL 造数点（标注：待商店/自然恢复域落地后可移除）：
 *   - UPDATE characters SET exp/qi/jing/neili/silver —— 学武、首战与交易的教学准备（恢复/经济域完善后收敛）
 *   - INSERT INTO character_items    —— 拾取/商店未落地时直接造行囊
 *
 * 每次运行用唯一邀请码 → 幂等可重跑（本地/CI 皆可）。
 */

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));
const DEV_PACK_DIR = fileURLToPath(
  new URL("../../../packages/content/fixtures/pack", import.meta.url),
);

if (!DATABASE_URL) {
  throw new Error(
    "e2e 需要 DATABASE_URL。本地请先执行 pnpm dev:infra 起 PostgreSQL/Redis，再 pnpm test:e2e。",
  );
}

const RUN_TAG = Date.now().toString(36);
const INVITE_A = `e2e-journey-a-${RUN_TAG}`;
const INVITE_B = `e2e-journey-b-${RUN_TAG}`;

let app: FastifyInstance;
let pool: pg.Pool;
let redis: RedisClientType;
let pack: Awaited<ReturnType<typeof loadContentDir>>["pack"];

async function migrate() {
  const dbClient = new pg.Client({ connectionString: DATABASE_URL });
  await dbClient.connect();
  await runner({
    dbClient,
    dir: MIGRATIONS_DIR,
    direction: "up",
    migrationsTable: "pgmigrations",
  });
  await dbClient.end();
}

beforeAll(async () => {
  await migrate();
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  redis = createClient({ url: REDIS_URL });
  await redis.connect();
  pack = (await loadContentDir(DEV_PACK_DIR)).pack;
  app = await createApp({
    deps: {
      db: createPgDb(pool),
      content: pack,
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
    inviteCodes: [INVITE_A, INVITE_B],
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await redis?.quit();
  await pool?.end();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("F3 全链路旅程", () => {
  let tokenA = "";
  let tokenB = "";
  let characterA = "";
  let characterB = "";
  let questId = "";
  let matchId = "";

  it("1. 登录（邀请码）→ 恢复点（无角色）", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: INVITE_A },
    });
    expect(res.statusCode).toBe(200);
    tokenA = (res.json() as { token: string }).token;

    const resume = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    expect(resume.statusCode).toBe(200);
    expect((resume.json() as { character: unknown }).character).toBeNull();
  });

  it("2. 建角 → 恢复点（角色快照）", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/characters",
      headers: auth(tokenA),
      payload: {
        name: `风${RUN_TAG.slice(-4)}`,
        gender: "male",
        attrs: { str: 25, int: 20, con: 20, dex: 15 },
      },
    });
    expect(res.statusCode).toBe(200);
    characterA = (res.json() as { characterId: string }).characterId;

    const resume = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    const body = resume.json() as {
      character: { id: string; roomPath: string; effectivePotential: number };
    };
    expect(body.character.id).toBe(characterA);
    expect(body.character.roomPath).toBe("village_start");
    expect(body.character.effectivePotential).toBe(0);
  });

  it("3. 场景探索：初始房间 → 向东到村口广场（含 NPC/物品/动作）", async () => {
    const scene = await app.inject({ method: "GET", url: "/scene", headers: auth(tokenA) });
    expect(scene.statusCode).toBe(200);
    expect((scene.json() as { id: string }).id).toBe("village_start");

    const move = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "move", dir: "east" },
    });
    expect(move.statusCode).toBe(200);
    const square = move.json() as { id: string; npcs: unknown[]; exits: unknown[] };
    expect(square.id).toBe("village_square");
    expect(square.npcs.length).toBeGreaterThan(0);
    expect(square.exits.length).toBeGreaterThan(0);

    const talk = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "talk", targetId: "village_chief" },
    });
    expect(talk.statusCode).toBe(200);
    expect((talk.json() as { kind: string; dialogue: string[] }).kind).toBe("talk");

    const shop = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "move", dir: "east" },
    });
    expect((shop.json() as { id: string }).id).toBe("village_general");
    const trade = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "trade", targetId: "general_shop" },
    });
    expect(trade.statusCode).toBe(200);
    expect((trade.json() as { kind: string; goods: unknown[] }).kind).toBe("trade");
    const take = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "take", targetId: "dry_food" },
    });
    expect(take.statusCode).toBe(200);
    // SQL 造数：首轮战斗前尚无银两来源；交易域已落地后用其结算验证买入。
    await pool.query("UPDATE characters SET silver = 10 WHERE id = $1", [characterA]);
    const buy = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "buy", targetId: "general_shop", itemId: "dry_food", count: 1 },
    });
    expect(buy.statusCode).toBe(200);
    expect((buy.json() as { kind: string; silver: number }).silver).toBe(9);

    const back = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "move", dir: "west" },
    });
    expect((back.json() as { id: string }).id).toBe("village_square");
  });

  it("4. 学武：当面请教王师傅；exp=0 → exp_gate；提经验后 learn/practice/study 走通", async () => {
    // 从村口北行至武馆当面请教（DC-039）
    await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "move", dir: "north" },
    });

    const learn0 = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: auth(tokenA),
      payload: { skillId: "basic_sword", npcId: "master_wang" },
    });
    expect(learn0.statusCode).toBe(409);
    expect((learn0.json() as { error: { code: string } }).error.code).toBe("exp_gate");

    // SQL 造数：补经验与潜能（见文件头注释）
    await pool.query("UPDATE characters SET exp = 1000, potential = 100 WHERE id = $1", [
      characterA,
    ]);

    const learn = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: auth(tokenA),
      payload: { skillId: "basic_sword", npcId: "master_wang" },
    });
    expect(learn.statusCode).toBe(200);
    expect(
      (learn.json() as { skill: { level: number }; spent: { silver: number } }).skill.level,
    ).toBe(1);
    expect((learn.json() as { spent: { silver: number } }).spent.silver).toBe(2);

    const practice = await app.inject({
      method: "POST",
      url: "/skills/practice",
      headers: auth(tokenA),
      payload: { skillId: "basic_sword", count: 3 },
    });
    expect(practice.statusCode).toBe(200);
    expect((practice.json() as { skill: { level: number } }).skill.level).toBe(2);

    const study = await app.inject({
      method: "POST",
      url: "/skills/study",
      headers: auth(tokenA),
      payload: { skillId: "basic_sword", count: 1 },
    });
    expect(study.statusCode).toBe(200);

    // 回到村口，供后续步骤
    await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: auth(tokenA),
      payload: { type: "move", dir: "south" },
    });
  });

  it("5. 任务：接 q_newbie_trail → 前往村外 → 战胜野狗 → 自动推进 → 交差发奖", async () => {
    const list = await app.inject({ method: "GET", url: "/quests", headers: auth(tokenA) });
    expect(list.statusCode).toBe(200);
    const quests = (list.json() as { quests: Array<{ id: string; status: string }> }).quests;
    questId = quests.find((q) => q.id === "q_newbie_trail")!.id;
    expect(quests.find((q) => q.id === questId)?.status).toBe("available");

    const accept = await app.inject({
      method: "POST",
      url: "/quests/accept",
      headers: auth(tokenA),
      payload: { questId },
    });
    expect(accept.statusCode).toBe(200);
    expect((accept.json() as { status: string }).status).toBe("ongoing");

    for (const dir of ["east", "east"]) {
      const move = await app.inject({
        method: "POST",
        url: "/scene/action",
        headers: auth(tokenA),
        payload: { type: "move", dir },
      });
      expect(move.statusCode).toBe(200);
    }

    // SQL 造数：回精/回气机制尚未落地，避免此前学武消耗令首战教学随机落败；待休息域落地后移除。
    await pool.query("UPDATE characters SET qi = 500, jing = 500, neili = 500 WHERE id = $1", [
      characterA,
    ]);

    const start = await app.inject({
      method: "POST",
      url: "/combat/start",
      headers: auth(tokenA),
      payload: { targetId: "wild_dog" },
    });
    expect(start.statusCode).toBe(200);
    let combat = start.json() as { status: string; events: Array<{ type: string }> };
    expect(combat.status).toBe("ongoing");

    for (let turn = 0; turn < 40 && combat.status === "ongoing"; turn += 1) {
      const action = await app.inject({
        method: "POST",
        url: "/combat/action",
        headers: auth(tokenA),
        payload: { action: "attack" },
      });
      expect(action.statusCode).toBe(200);
      combat = action.json() as { status: string; events: Array<{ type: string }> };
    }
    expect(combat.status).toBe("finished");
    expect(combat.events.some((event) => event.type === "reward")).toBe(true);
    expect(combat.events.some((event) => event.type === "quest_progress")).toBe(true);

    const report = await app.inject({
      method: "POST",
      url: "/quests/report",
      headers: auth(tokenA),
      payload: { questId },
    });
    expect(report.statusCode).toBe(200);
    const reward = report.json() as { rewards: { exp: number; potential: number; silver: number } };
    expect(reward.rewards).toMatchObject({ exp: 30, potential: 8, silver: 5 });
  });

  it("6. 挂机：start(study) → status → F2 结算（精耗 + 技能成长）→ stop → reports", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/afk/start",
      headers: auth(tokenA),
      payload: { kind: "study", durationMinutes: 30, config: { skillId: "basic_sword" } },
    });
    expect(start.statusCode).toBe(200);
    expect((start.json() as { kind: string }).kind).toBe("study");

    const status = await app.inject({ method: "GET", url: "/afk/status", headers: auth(tokenA) });
    expect(status.statusCode).toBe(200);
    expect((status.json() as { status: string }).status).toBe("running");

    // F2：模拟 worker 结算（now 前移 10 分钟 → deltaHours > 0），验证修炼收益落库
    // SQL 造数：回精（回精/休息机制随 food/rest 域落地后移除）
    await pool.query("UPDATE characters SET jing = 500 WHERE id = $1", [characterA]);
    const resumeBefore = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    const jingBefore = (resumeBefore.json() as { character: { vitals: { jing: number } } })
      .character.vitals.jing;
    const skillsBefore = (await app
      .inject({ method: "GET", url: "/skills", headers: auth(tokenA) })
      .then((r) => r.json())) as Array<{ id: string; level: number; practicePoints: number }>;
    const swordBefore = skillsBefore.find((s) => s.id === "basic_sword")!;
    const sumBefore = swordBefore.level + swordBefore.practicePoints;
    await settleDueJobs({ pool, content: pack, now: Date.now() + 10 * 60_000 });

    // 结算信号：精显著消耗（修炼次数=时长×每小时次数 × 参悟耗精）
    const resumeAfter = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    const jingAfter = (resumeAfter.json() as { character: { vitals: { jing: number } } }).character
      .vitals.jing;
    expect(jingAfter).toBeLessThan(jingBefore - 100);
    // 技能进度不倒退（成长细节由 settlement 单测覆盖）
    const skillsAfter = (await app
      .inject({ method: "GET", url: "/skills", headers: auth(tokenA) })
      .then((r) => r.json())) as Array<{ id: string; level: number; practicePoints: number }>;
    const swordAfter = skillsAfter.find((s) => s.id === "basic_sword")!;
    expect(swordAfter.level + swordAfter.practicePoints).toBeGreaterThanOrEqual(sumBefore);

    const status2 = await app.inject({ method: "GET", url: "/afk/status", headers: auth(tokenA) });
    expect((status2.json() as { status: string }).status).toBe("running"); // 10 分钟 < 30 分钟，未到期

    const stop = await app.inject({ method: "POST", url: "/afk/stop", headers: auth(tokenA) });
    expect(stop.statusCode).toBe(200);
    expect((stop.json() as { status: string }).status).toBe("cancelled");

    const reports = await app.inject({
      method: "GET",
      url: "/afk/reports",
      headers: auth(tokenA),
    });
    expect(reports.statusCode).toBe(200);
    expect((reports.json() as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("7. 行侠挂机：已接悬赏 + 战术快照 → Worker 自动战斗/交差/战报", async () => {
    const template = await app.inject({
      method: "POST",
      url: "/templates",
      headers: auth(tokenA),
      payload: {
        name: "行侠常式",
        config: { version: 1, rules: [], defaultAction: { type: "attack" } },
      },
    });
    expect(template.statusCode).toBe(200);
    const templateId = (template.json() as { id: string }).id;

    const accept = await app.inject({
      method: "POST",
      url: "/quests/accept",
      headers: auth(tokenA),
      payload: { questId: "q_newbie_trail" },
    });
    expect(accept.statusCode).toBe(200);
    // SQL 造数：回精/回气机制待 rest 域落地，保证挂机战术仅验证作业结算而不因上次战斗资源耗尽失败。
    await pool.query("UPDATE characters SET qi = 500, jing = 500, neili = 500 WHERE id = $1", [
      characterA,
    ]);
    const before = await pool.query<{ exp: number; potential: number; silver: number }>(
      "SELECT exp, potential, silver FROM characters WHERE id = $1",
      [characterA],
    );

    const start = await app.inject({
      method: "POST",
      url: "/afk/start",
      headers: auth(tokenA),
      payload: {
        kind: "quest",
        templateId,
        durationMinutes: 30,
        config: { questId: "q_newbie_trail" },
      },
    });
    expect(start.statusCode).toBe(200);
    await settleDueJobs({ pool, content: pack, now: Date.now() + 60_000 });

    const status = await app.inject({ method: "GET", url: "/afk/status", headers: auth(tokenA) });
    expect((status.json() as { active: boolean }).active).toBe(false);
    const reports = await app.inject({ method: "GET", url: "/afk/reports", headers: auth(tokenA) });
    const report = (
      reports.json() as Array<{ kind: string; status: string; gains: { exp: number } }>
    )[0]!;
    expect(report).toMatchObject({ kind: "quest", status: "completed" });
    expect(report.gains.exp).toBeGreaterThan(30);
    const after = await pool.query<{ exp: number; potential: number; silver: number }>(
      "SELECT exp, potential, silver FROM characters WHERE id = $1",
      [characterA],
    );
    expect(Number(after.rows[0]!.exp)).toBeGreaterThan(Number(before.rows[0]!.exp));
    const quest = await pool.query<{ status: string }>(
      "SELECT status FROM character_quests WHERE character_id = $1 AND quest_id = $2",
      [characterA, "q_newbie_trail"],
    );
    expect(quest.rows[0]?.status).toBe("reported");
  });

  it("8. 地图：GET /map 返回当前区域舆图、天下图且当前房间被标记", async () => {
    const map = await app.inject({ method: "GET", url: "/map", headers: auth(tokenA) });
    expect(map.statusCode).toBe(200);
    const data = map.json() as {
      areaId: string;
      areaLabel: string;
      rooms: Array<{ id: string; grid: [number, number]; state: string }>;
      edges: Array<{ from: string; to: string }>;
      world: { nodes: Array<{ id: string; state: string }>; roads: unknown[] };
    };
    expect(data.areaId).toBeTruthy();
    expect(data.areaLabel).toBeTruthy();
    expect(data.rooms.length).toBeGreaterThan(0);
    expect(data.rooms.every((r) => r.grid.length === 2)).toBe(true);
    expect(data.rooms.some((r) => r.state === "current")).toBe(true);
    expect(data.edges.length).toBeGreaterThan(0);
    expect(data.world.nodes.some((n) => n.id === data.areaId && n.state === "current")).toBe(true);
  });

  it("9. PVP：第二账号建角 → 赛季 → 对手 → 对战 → 战报 → 榜单", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: INVITE_B },
    });
    tokenB = (loginB.json() as { token: string }).token;
    const createB = await app.inject({
      method: "POST",
      url: "/characters",
      headers: auth(tokenB),
      payload: {
        name: `云${RUN_TAG.slice(-4)}`,
        gender: "female",
        attrs: { str: 20, int: 25, con: 18, dex: 17 },
      },
    });
    characterB = (createB.json() as { characterId: string }).characterId;
    expect(characterB).toBeTruthy();

    const season = await app.inject({ method: "GET", url: "/pvp/season", headers: auth(tokenA) });
    expect(season.statusCode).toBe(200);

    const opponents = await app.inject({
      method: "GET",
      url: "/pvp/opponents",
      headers: auth(tokenA),
    });
    expect(opponents.statusCode).toBe(200);
    const oppList = opponents.json() as Array<{ characterId: string }>;
    expect(oppList.length).toBeGreaterThan(0);
    // 自己不出现在对手列表（复用 dev 库时历史角色会占满 Top10，不断言包含新角色）
    expect(oppList.some((o) => o.characterId === characterA)).toBe(false);

    const match = await app.inject({
      method: "POST",
      url: "/pvp/match",
      headers: auth(tokenA),
      payload: { defenderId: characterB },
    });
    expect(match.statusCode).toBe(200);
    const view = match.json() as { id: string; result: string; turns: number };
    expect(["challenger_win", "defender_win", "draw"]).toContain(view.result);
    matchId = view.id;

    const detail = await app.inject({
      method: "GET",
      url: `/pvp/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(detail.statusCode).toBe(200);
    expect(Array.isArray((detail.json() as { events: unknown[] }).events)).toBe(true);

    const lb = await app.inject({ method: "GET", url: "/leaderboard/growth" });
    expect(lb.statusCode).toBe(200);
    expect((lb.json() as { entries: unknown[] }).entries.length).toBeGreaterThanOrEqual(2);
  });

  it("10. 断线恢复：resume 返回未读 PVP 战报 → 二次 resume 清空", async () => {
    const resume = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    const body = resume.json() as { pendingPvpReportIds: string[] };
    expect(body.pendingPvpReportIds).toContain(matchId);

    const again = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: auth(tokenA),
    });
    expect((again.json() as { pendingPvpReportIds: string[] }).pendingPvpReportIds).toHaveLength(0);
  });

  it("11. 装备/使用：SQL 造行囊 → equip → unequip → use（气血恢复）", async () => {
    await pool.query(
      "INSERT INTO character_items (id, character_id, item_def_id, quantity) VALUES (gen_random_uuid(), $1, 'iron_sword', 1)",
      [characterA],
    );
    await pool.query(
      "INSERT INTO character_items (id, character_id, item_def_id, quantity) VALUES (gen_random_uuid(), $1, 'jinchuang_yao', 1)",
      [characterA],
    );
    const inv = await app.inject({ method: "GET", url: "/inventory", headers: auth(tokenA) });
    const items = inv.json() as Array<{ id: string; name: string; equipped: boolean }>;
    // 首战掉落可能已在行囊中；只断言本步骤造入的两件物品均可见。
    expect(items.length).toBeGreaterThanOrEqual(2);

    const sword = items.find((i) => i.name === "铁剑")!;
    const equip = await app.inject({
      method: "POST",
      url: "/inventory/equip",
      headers: auth(tokenA),
      payload: { itemId: sword.id },
    });
    expect(equip.statusCode).toBe(200);

    const unequip = await app.inject({
      method: "POST",
      url: "/inventory/unequip",
      headers: auth(tokenA),
      payload: { itemId: sword.id },
    });
    expect(unequip.statusCode).toBe(200);

    const yao = items.find((i) => i.name === "金创药")!;
    const use = await app.inject({
      method: "POST",
      url: "/inventory/use",
      headers: auth(tokenA),
      payload: { itemId: yao.id },
    });
    expect(use.statusCode).toBe(200);
    expect((use.json() as { effect: string }).effect).toBe("heal_qi");
  });

  it("12. 论坛：板块 → 发帖 → 列表/详情 → 评论 → 点赞 → 举报", async () => {
    const sections = await app.inject({ method: "GET", url: "/forum/sections" });
    expect(sections.statusCode).toBe(200);
    const secList = sections.json() as Array<{ id: string }>;
    expect(secList.length).toBeGreaterThan(0);

    const create = await app.inject({
      method: "POST",
      url: "/forum/posts",
      headers: auth(tokenA),
      payload: { sectionId: secList[0]!.id, title: "论剑心得", body: "先练三年基本功。" },
    });
    expect(create.statusCode).toBe(200);
    const post = create.json() as { id: string };

    const posts = await app.inject({ method: "GET", url: "/forum/posts" });
    expect((posts.json() as Array<{ id: string }>).some((p) => p.id === post.id)).toBe(true);

    const comment = await app.inject({
      method: "POST",
      url: `/forum/posts/${post.id}/comments`,
      headers: auth(tokenA),
      payload: { body: "受教了" },
    });
    expect(comment.statusCode).toBe(200);

    const like = await app.inject({
      method: "POST",
      url: "/forum/likes",
      headers: auth(tokenA),
      payload: { postId: post.id },
    });
    expect(like.statusCode).toBe(200);
    expect((like.json() as { liked: boolean }).liked).toBe(true);

    const report = await app.inject({
      method: "POST",
      url: "/forum/reports",
      headers: auth(tokenA),
      payload: { targetType: "post", targetId: post.id, reason: "请核" },
    });
    expect(report.statusCode).toBe(200);
  });

  it("13. 登出：会话吊销，原 token 失效", async () => {
    const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: auth(tokenA) });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/scene", headers: auth(tokenA) });
    expect(after.statusCode).toBe(401);
  });
});
