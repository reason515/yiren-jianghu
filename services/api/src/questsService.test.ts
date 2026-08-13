import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { QuestsError, createQuestsService } from "./questsService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

/** 最小内容包：growth 参数 + 三条任务（可重复悬赏 / 门派跑腿 / 主线）。 */
const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [],
  skills: [],
  performs: [],
  quests: [
    {
      id: "q_hunt",
      name: "除野狗",
      kind: "bounty",
      minExp: 0,
      briefing: "村外野狗成群。",
      phases: [{ type: "kill", targetId: "wild_dog", count: 2 }],
      rewards: { exp: 30, potential: 8, silver: 5 },
      repeatable: true,
    },
    {
      id: "q_errand",
      name: "送药",
      kind: "sect",
      minExp: 100,
      briefing: "把伤药送到大师兄手里。",
      phases: [
        { type: "talk", targetId: "master_wang" },
        { type: "deliver", targetId: "herbs", count: 2 },
      ],
      rewards: { exp: 100, potential: 20, silver: 50 },
      repeatable: false,
    },
    {
      id: "q_main",
      name: "江湖试炼",
      kind: "main",
      minExp: 1000,
      briefing: "下山前的最后一课。",
      phases: [{ type: "goto", targetId: "city_gate" }],
      rewards: { exp: 500, potential: 100, silver: 200 },
      repeatable: false,
    },
  ],
  story: [
    { id: "s_begin", title: "初入江湖", questId: "q_hunt", text: "", next: [] },
    { id: "s_learn", title: "拜师学艺", text: "", next: [] },
  ],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
  exp: number;
  potential: number;
  silver: number;
}

interface QuestState {
  character_id: string;
  quest_id: string;
  status: string;
  progress: { phase: number; counts: Record<string, number> };
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    quests: [] as QuestState[],
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      // 具体 SELECT 必须在通用分支前（见 conventions 常见坑 #15）
      if (text.includes("FROM accounts WHERE invite_code")) {
        return {
          rows: state.accounts
            .filter((a) => a.invite_code === params[0])
            .map((a) => ({ id: a.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO accounts")) {
        const id = `acc_${state.accounts.length + 1}`;
        state.accounts.push({ id, invite_code: String(params[0]) });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO sessions")) {
        state.sessions.push({
          token: String(params[0]),
          account_id: String(params[1]),
          expires_at: String(params[2]),
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM sessions WHERE token")) {
        return {
          rows: state.sessions
            .filter((s) => s.token === params[0])
            .map((s) => ({ account_id: s.account_id, expires_at: s.expires_at })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, exp, potential, silver FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              exp: c.exp,
              potential: c.potential,
              silver: c.silver,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT quest_id, status, progress FROM character_quests")) {
        return {
          rows: state.quests
            .filter((q) => q.character_id === params[0])
            .map((q) => ({
              quest_id: q.quest_id,
              status: q.status,
              progress: q.progress,
            })) as unknown as T[],
        };
      }
      if (text.includes("UPDATE characters SET exp = exp +")) {
        const c = state.characters.find((ch) => ch.id === params[3]);
        if (c) {
          c.exp += Number(params[0]);
          c.potential += Number(params[1]);
          c.silver += Number(params[2]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SET status = 'reported'")) {
        const q = state.quests.find(
          (x) => x.character_id === params[0] && x.quest_id === params[1],
        );
        if (q) q.status = "reported";
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SET status = 'accepted'")) {
        const q = state.quests.find(
          (x) => x.character_id === params[1] && x.quest_id === params[2],
        );
        if (q) {
          q.status = "accepted";
          q.progress = JSON.parse(String(params[0]));
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("status = 'completed'")) {
        const q = state.quests.find(
          (x) => x.character_id === params[1] && x.quest_id === params[2],
        );
        if (q) {
          q.status = "completed";
          q.progress = JSON.parse(String(params[0]));
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SET progress")) {
        const q = state.quests.find(
          (x) => x.character_id === params[1] && x.quest_id === params[2],
        );
        if (q) q.progress = JSON.parse(String(params[0]));
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("INSERT INTO character_quests")) {
        state.quests.push({
          character_id: String(params[0]),
          quest_id: String(params[1]),
          status: "accepted",
          progress: JSON.parse(String(params[2])),
        });
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot(over: Partial<CharState> = {}) {
  const { db, state } = mockDb();
  state.characters.push({
    id: "char_1",
    account_id: "acc_1",
    status: "active",
    exp: 50,
    potential: 10,
    silver: 20,
    ...over,
  });
  const quests = createQuestsService(db, PACK);
  return { db, state, quests };
}

describe("questsService.getQuests", () => {
  it("状态映射：available/locked/ongoing/reportable/completed", async () => {
    const { quests, state } = boot({ exp: 50 });
    // q_hunt 已接受未完成 → ongoing；q_errand 已全部完成 → reportable；q_main 未接且 exp 不足 → locked
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_hunt",
      status: "accepted",
      progress: { phase: 0, counts: { wild_dog: 1 } },
    });
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_errand",
      status: "accepted",
      progress: { phase: 2, counts: { master_wang: 1, herbs: 2 } },
    });
    const list = await quests.getQuests("acc_1");
    expect(list).toHaveLength(3);
    const byId = new Map(list!.map((q) => [q.id, q]));
    expect(byId.get("q_hunt")?.status).toBe("ongoing");
    expect(byId.get("q_hunt")?.phases[0]).toMatchObject({ done: 1, count: 2 });
    expect(byId.get("q_errand")?.status).toBe("reportable");
    expect(byId.get("q_main")?.status).toBe("locked");
  });

  it("reportable → 交后：可重复任务回到 available，一次性任务 completed", async () => {
    const { quests, state } = boot({ exp: 1500 });
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_errand",
      status: "reported",
      progress: { phase: 2, counts: { master_wang: 1, herbs: 2 } },
    });
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_main",
      status: "reported",
      progress: { phase: 1, counts: { city_gate: 1 } },
    });
    const list = await quests.getQuests("acc_1");
    const byId = new Map(list!.map((q) => [q.id, q]));
    expect(byId.get("q_errand")?.status).toBe("completed");
    expect(byId.get("q_main")?.status).toBe("completed");
    // 可重复的 q_hunt：reported 后回到 available
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_hunt",
      status: "reported",
      progress: { phase: 1, counts: { wild_dog: 2 } },
    });
    const again = await quests.getQuests("acc_1");
    expect(new Map(again!.map((q) => [q.id, q])).get("q_hunt")?.status).toBe("available");
  });

  it("无角色返回 null", async () => {
    const { quests } = boot();
    expect(await quests.getQuests("acc_x")).toBeNull();
  });
});

describe("questsService.getOverview story 链", () => {
  it("按 next 链排序，「今」落在根节点而非文件名靠前的入城", async () => {
    const { db, state } = mockDb();
    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      exp: 0,
      potential: 10,
      silver: 10,
    });
    const quests = createQuestsService(db, {
      ...PACK,
      story: [
        { id: "s_arrive_city", title: "入城", text: "", next: [] },
        { id: "s_begin", title: "初入江湖", questId: "q_hunt", text: "", next: ["s_learn"] },
        { id: "s_learn", title: "拜师学艺", text: "", next: [] },
      ],
    } as typeof PACK);
    const overview = await quests.getOverview("acc_1");
    expect(overview?.story.map((n) => n.id)).toEqual(["s_begin", "s_learn", "s_arrive_city"]);
    expect(overview?.story.find((n) => n.current)?.id).toBe("s_begin");
  });
});

describe("questsService.acceptQuest", () => {
  it("接受任务：写入 accepted 并返回任务卡", async () => {
    const { quests, state } = boot();
    const view = await quests.acceptQuest("acc_1", "q_hunt");
    expect(view.status).toBe("ongoing");
    expect(state.quests[0]).toMatchObject({ quest_id: "q_hunt", status: "accepted" });
  });

  it("经验不足 → min_exp；未收录 → quest_not_found；进行中/未交 → already_accepted", async () => {
    const { quests } = boot({ exp: 50 });
    await expect(quests.acceptQuest("acc_1", "q_errand")).rejects.toMatchObject({
      code: "min_exp",
    });
    await expect(quests.acceptQuest("acc_1", "q_unknown")).rejects.toMatchObject({
      code: "quest_not_found",
    });
    await quests.acceptQuest("acc_1", "q_hunt");
    await expect(quests.acceptQuest("acc_1", "q_hunt")).rejects.toMatchObject({
      code: "already_accepted",
    });
  });

  it("一次性任务已交 → already_completed；可重复任务 reported 后可重接（重置进度）", async () => {
    const { quests, state } = boot({ exp: 1500 });
    state.quests.push({
      character_id: "char_1",
      quest_id: "q_errand",
      status: "reported",
      progress: { phase: 2, counts: { master_wang: 1, herbs: 2 } },
    });
    await expect(quests.acceptQuest("acc_1", "q_errand")).rejects.toMatchObject({
      code: "already_completed",
    });

    state.quests.push({
      character_id: "char_1",
      quest_id: "q_hunt",
      status: "reported",
      progress: { phase: 1, counts: { wild_dog: 2 } },
    });
    const view = await quests.acceptQuest("acc_1", "q_hunt");
    expect(view.status).toBe("ongoing");
    expect(state.quests.find((q) => q.quest_id === "q_hunt")?.status).toBe("accepted");
    expect(state.quests.find((q) => q.quest_id === "q_hunt")?.progress.phase).toBe(0);
  });
});

describe("questsService.recordProgress", () => {
  it("击杀推进当前相位；全部完成 → completed 状态", async () => {
    const { quests, state } = boot();
    await quests.acceptQuest("acc_1", "q_hunt");
    const r1 = await quests.recordProgress("acc_1", "kill", "wild_dog");
    expect(r1).toMatchObject({ questId: "q_hunt", phase: 0, completed: false });
    const r2 = await quests.recordProgress("acc_1", "kill", "wild_dog");
    expect(r2).toMatchObject({ questId: "q_hunt", phase: 1, completed: true });
    expect(state.quests[0]?.status).toBe("completed");
  });

  it("talk 一次即完成相位；deliver 按数量推进", async () => {
    const { quests, state } = boot({ exp: 1500 });
    await quests.acceptQuest("acc_1", "q_errand");
    const t = await quests.recordProgress("acc_1", "talk", "master_wang");
    expect(t?.phase).toBe(1);
    const d1 = await quests.recordProgress("acc_1", "deliver", "herbs");
    expect(d1?.phase).toBe(1);
    const d2 = await quests.recordProgress("acc_1", "deliver", "herbs");
    expect(d2?.phase).toBe(2);
    expect(d2?.completed).toBe(true);
    expect(state.quests[0]?.status).toBe("completed");
  });

  it("非当前相位/未接受任务不推进；无匹配返回 null", async () => {
    const { quests } = boot();
    await quests.acceptQuest("acc_1", "q_hunt");
    const miss = await quests.recordProgress("acc_1", "kill", "wild_wolf");
    expect(miss).toBeNull();
    // 未接受的任务不响应
    const idle = await quests.recordProgress("acc_1", "goto", "city_gate");
    expect(idle).toBeNull();
  });
});

describe("questsService.reportQuest", () => {
  it("未接受 → not_accepted；未完成 → not_complete；成功发放奖励并标记 reported", async () => {
    const { quests, state } = boot();
    await expect(quests.reportQuest("acc_1", "q_hunt")).rejects.toMatchObject({
      code: "not_accepted",
    });

    await quests.acceptQuest("acc_1", "q_hunt");
    await expect(quests.reportQuest("acc_1", "q_hunt")).rejects.toMatchObject({
      code: "not_complete",
    });

    await quests.recordProgress("acc_1", "kill", "wild_dog");
    await quests.recordProgress("acc_1", "kill", "wild_dog");
    const res = await quests.reportQuest("acc_1", "q_hunt");
    expect(res.rewards).toEqual({ exp: 30, potential: 8, silver: 5 });
    expect(res.character).toEqual({ exp: 80, potential: 18, silver: 25 });
    expect(state.quests[0]?.status).toBe("reported");
  });

  it("未收录任务 → quest_not_found", async () => {
    const { quests } = boot();
    await expect(quests.reportQuest("acc_1", "q_unknown")).rejects.toMatchObject({
      code: "quest_not_found",
    });
  });
});

describe("app 集成（quests 路由）", () => {
  it("GET /quests → accept → recordProgress → report 全链路", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };

    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      exp: 50,
      potential: 10,
      silver: 20,
    });

    const list = await app.inject({
      method: "GET",
      url: "/quests",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      quests: expect.arrayContaining([expect.objectContaining({ id: "q_hunt" })]),
      story: [
        { id: "s_begin", done: false, current: true },
        { id: "s_learn", done: false, current: false },
      ],
    });

    const accept = await app.inject({
      method: "POST",
      url: "/quests/accept",
      headers: { authorization: `Bearer ${token}` },
      payload: { questId: "q_hunt" },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json()).toMatchObject({ id: "q_hunt", status: "ongoing" });

    // 交差需全部相位完成（recordProgress 为内部钩子，战斗域实现后驱动；此处验证未完成拒绝）
    const report = await app.inject({
      method: "POST",
      url: "/quests/report",
      headers: { authorization: `Bearer ${token}` },
      payload: { questId: "q_hunt" },
    });
    expect(report.statusCode).toBe(409);
    expect((report.json() as { error: { code: string } }).error).toMatchObject({
      code: "not_complete",
    });

    const badAccept = await app.inject({
      method: "POST",
      url: "/quests/accept",
      headers: { authorization: `Bearer ${token}` },
      payload: { questId: "q_nope" },
    });
    expect(badAccept.statusCode).toBe(404);
    expect((badAccept.json() as { error: { code: string } }).error).toMatchObject({
      code: "quest_not_found",
    });
  });

  it("QuestsError 类型存在（路由映射依赖）", () => {
    expect(QuestsError).toBeDefined();
  });
});
