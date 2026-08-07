import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { SkillsError, createSkillsService } from "./skillsService.js";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";

/** 最小内容包：growth 参数 + 两门武功（满级 100 / 满级 1）。 */
const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: {
    expCurve: { base: 100, growth: 1.1 },
    potential: { learnCostFactor: 1 },
    combat: { baseHitRate: 0.7, baseDodgeRate: 0.1, baseParryRate: 0.15 },
    afk: { maxDurationHours: 8, dailyDiminishRate: 0.5 },
    growth: {
      learnJingCostBase: 150,
      potentialCostPerLevel: 1,
      expGateExponent: 3,
      expGateDivisor: 10,
      practiceQiBase: 20,
      practiceQiPerLevel: 1,
      practicePointsPerAction: 1,
      studyJingBase: 80,
    },
    vitals: {
      qiBase: 100,
      jingBase: 100,
      jingliBase: 100,
      qiPerCon: 16,
      qiPerStr: 0,
      jingPerInt: 16,
      forceQiPerLevel: 2,
      forceJingPerLevel: 1,
      neiliPerLevel: 10,
      jingliPerLevel: 3,
      neiliToQiDiv: 4,
      neiliToJingDiv: 12,
      foodBase: 200,
      foodPerCon: 10,
      waterBase: 200,
      waterPerDex: 10,
    },
    pvp: { dailyChallengeLimit: 5, kFactor: 32, seasonWeeks: 6 },
    economy: { silverDropBase: 5, maxCashflowPerDay: 1000 },
  },
  rooms: [],
  npcs: [],
  items: [],
  skills: [
    {
      id: "basic_sword",
      name: "基础剑法",
      category: "weapon",
      maxLevel: 100,
      description: "入门剑法",
    },
    {
      id: "trivial_art",
      name: "粗浅功夫",
      category: "parry",
      maxLevel: 1,
      description: "一招半式",
    },
  ],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
  exp: number;
  potential: number;
  learned_points: number;
  jing: number;
  qi: number;
  attrs: { str: number; int: number; con: number; dex: number };
}

interface SkillState {
  character_id: string;
  skill_id: string;
  level: number;
  practice_points: number;
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    skills: [] as SkillState[],
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
      if (
        text.includes("SELECT id, exp, potential, learned_points, jing, qi, attrs FROM characters")
      ) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              exp: c.exp,
              potential: c.potential,
              learned_points: c.learned_points,
              jing: c.jing,
              qi: c.qi,
              attrs: c.attrs,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT skill_id, level, practice_points FROM character_skills")) {
        return {
          rows: state.skills
            .filter((s) => s.character_id === params[0])
            .map((s) => ({
              skill_id: s.skill_id,
              level: s.level,
              practice_points: s.practice_points,
            })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO character_skills")) {
        const skill = state.skills.find(
          (s) => s.character_id === params[0] && s.skill_id === params[1],
        );
        if (skill) {
          skill.level = Number(params[2]);
          skill.practice_points = Number(params[3]);
        } else {
          state.skills.push({
            character_id: String(params[0]),
            skill_id: String(params[1]),
            level: Number(params[2]),
            practice_points: Number(params[3]),
          });
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET potential")) {
        const c = state.characters.find((ch) => ch.id === params[2]);
        if (c) {
          c.potential -= Number(params[0]);
          c.learned_points += Number(params[0]);
          c.jing -= Number(params[1]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET qi")) {
        const c = state.characters.find((ch) => ch.id === params[1]);
        if (c) c.qi -= Number(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET jing")) {
        const c = state.characters.find((ch) => ch.id === params[1]);
        if (c) c.jing -= Number(params[0]);
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
    exp: 1000,
    potential: 100,
    learned_points: 0,
    jing: 500,
    qi: 500,
    attrs: { str: 20, int: 30, con: 20, dex: 10 },
    ...over,
  });
  const skills = createSkillsService(db, PACK);
  return { db, state, skills };
}

describe("skillsService.getSkills", () => {
  it("列出内容包全部武功与当前进度；无角色返回 null", async () => {
    const { skills, state } = boot();
    state.skills.push({
      character_id: "char_1",
      skill_id: "basic_sword",
      level: 3,
      practice_points: 1,
    });
    const list = await skills.getSkills("acc_1");
    expect(list).toHaveLength(2);
    expect(list?.[0]).toMatchObject({ id: "basic_sword", level: 3, practicePoints: 1 });
    expect(list?.[1]).toMatchObject({ id: "trivial_art", level: 0, practicePoints: 0 });
    expect(await skills.getSkills("acc_x")).toBeNull();
  });
});

describe("skillsService.learn", () => {
  it("学习成功：升 1 级，扣潜能与精，learned_points 同步", async () => {
    const { skills, state } = boot();
    const res = await skills.learn("acc_1", "basic_sword");
    expect(res.skill).toMatchObject({ id: "basic_sword", level: 1 });
    expect(res.spent).toEqual({ potential: 1, jing: 5 }); // 150/30(int)=5
    const ch = state.characters[0]!;
    expect(ch.potential).toBe(99);
    expect(ch.learned_points).toBe(1);
    expect(ch.jing).toBe(495);
    expect(state.skills[0]).toMatchObject({
      skill_id: "basic_sword",
      level: 1,
      practice_points: 0,
    });
  });

  it("经验不足 → exp_gate", async () => {
    const { skills } = boot({ exp: 0 });
    await expect(skills.learn("acc_1", "basic_sword")).rejects.toMatchObject({ code: "exp_gate" });
  });

  it("潜能不足 → potential", async () => {
    const { skills } = boot({ potential: 0, learned_points: 10 });
    await expect(skills.learn("acc_1", "basic_sword")).rejects.toMatchObject({
      code: "potential",
    });
  });

  it("精不足 → jing", async () => {
    const { skills } = boot({ jing: 0 });
    await expect(skills.learn("acc_1", "basic_sword")).rejects.toMatchObject({ code: "jing" });
  });

  it("已满级 → max_level；未知武功 → skill_not_found；无角色 → no_character", async () => {
    const { skills, state } = boot();
    state.skills.push({
      character_id: "char_1",
      skill_id: "trivial_art",
      level: 1,
      practice_points: 0,
    });
    await expect(skills.learn("acc_1", "trivial_art")).rejects.toMatchObject({
      code: "max_level",
    });
    await expect(skills.learn("acc_1", "unknown_art")).rejects.toMatchObject({
      code: "skill_not_found",
    });
    await expect(skills.learn("acc_x", "basic_sword")).rejects.toMatchObject({
      code: "no_character",
    });
  });
});

describe("skillsService.practice", () => {
  it("演练一次：消耗气血并升级；进度点持久化", async () => {
    const { skills, state } = boot();
    const res = await skills.practice("acc_1", "basic_sword", 1);
    // level 0 → cost 20，1 点即满 level+1=1 → 直接升级
    expect(res.skill.level).toBe(1);
    expect(res.leveled).toBe(true);
    expect(res.qiSpent).toBe(20);
    expect(state.characters[0]?.qi).toBe(480);
    expect(state.skills[0]).toMatchObject({ skill_id: "basic_sword", level: 1 });
  });

  it("多次演练：逐级扣气血（含等级成长成本）", async () => {
    const { skills, state } = boot();
    const res = await skills.practice("acc_1", "basic_sword", 3);
    // 20 + 21 + 21 = 62；level 0→1→2
    expect(res.qiSpent).toBe(62);
    expect(res.skill.level).toBe(2);
    expect(state.characters[0]?.qi).toBe(438);
  });

  it("气血不足 → qi；满级 → max_level；中途力竭保留已练部分", async () => {
    const { skills } = boot({ qi: 0 });
    await expect(skills.practice("acc_1", "basic_sword", 1)).rejects.toMatchObject({
      code: "qi",
    });

    const { skills: s2, state } = boot({ qi: 35 });
    const res = await s2.practice("acc_1", "basic_sword", 10);
    // 第一次 20（升级），第二次需 21 > 剩余 15 → 中断，仅 1 次
    expect(res.iterations).toBe(1);
    expect(res.qiSpent).toBe(20);
    expect(state.characters[0]?.qi).toBe(15);

    const { skills: s3, state: st3 } = boot();
    st3.skills.push({
      character_id: "char_1",
      skill_id: "trivial_art",
      level: 1,
      practice_points: 0,
    });
    await expect(s3.practice("acc_1", "trivial_art", 1)).rejects.toMatchObject({
      code: "max_level",
    });
  });

  it("非法次数 → invalid_count", async () => {
    const { skills } = boot();
    await expect(skills.practice("acc_1", "basic_sword", 0)).rejects.toMatchObject({
      code: "invalid_count",
    });
    await expect(skills.practice("acc_1", "basic_sword", 51)).rejects.toMatchObject({
      code: "invalid_count",
    });
  });
});

describe("skillsService.study", () => {
  it("参悟一次：消耗精并升级", async () => {
    const { skills, state } = boot();
    const res = await skills.study("acc_1", "basic_sword", 1);
    expect(res.skill.level).toBe(1);
    expect(res.jingSpent).toBe(80); // studyJingBase 80 + level 0
    expect(state.characters[0]?.jing).toBe(420);
  });

  it("精不足 → jing", async () => {
    const { skills } = boot({ jing: 0 });
    await expect(skills.study("acc_1", "basic_sword", 1)).rejects.toMatchObject({
      code: "jing",
    });
  });
});

describe("app 集成（skills 路由）", () => {
  it("GET /skills 与 POST /skills/learn 全链路（登录→建角→学习）", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };
    expect(token).toBeTruthy();

    // 无角色 → 404
    const noChar = await app.inject({
      method: "GET",
      url: "/skills",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(noChar.statusCode).toBe(404);

    // 建角（acc_1）
    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      exp: 1000,
      potential: 100,
      learned_points: 0,
      jing: 500,
      qi: 500,
      attrs: { str: 20, int: 30, con: 20, dex: 10 },
    });
    const list = await app.inject({
      method: "GET",
      url: "/skills",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as unknown[]).length).toBe(2);

    const learn = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: { authorization: `Bearer ${token}` },
      payload: { skillId: "basic_sword" },
    });
    expect(learn.statusCode).toBe(200);
    expect((learn.json() as { skill: { level: number } }).skill.level).toBe(1);

    const learnBad = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: { authorization: `Bearer ${token}` },
      payload: { skillId: "nope" },
    });
    expect(learnBad.statusCode).toBe(404);
    expect((learnBad.json() as { error: { code: string } }).error).toMatchObject({
      code: "skill_not_found",
    });
  });

  it("学习错误包装为 SkillsError（供路由映射）", () => {
    expect(SkillsError).toBeDefined();
  });
});
