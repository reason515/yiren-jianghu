import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { SkillsError, createSkillsService } from "./skillsService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

/** 最小内容包：含村武馆教头与一门可教武功（DC-039）。 */
const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [
    { id: "village_dojo", area: "newbie", name: "武馆", npcIds: ["master_wang"], exits: [] },
    { id: "village_elsewhere", area: "newbie", name: "别处", npcIds: [], exits: [] },
    {
      id: "sect_yard",
      area: "xuanmen",
      name: "练剑坪",
      npcIds: ["senior_brother"],
      exits: [],
    },
    {
      id: "sect_hall",
      area: "xuanmen",
      name: "祖师堂",
      npcIds: ["sect_master"],
      exits: [],
    },
  ],
  npcs: [
    {
      id: "master_wang",
      name: "王师傅",
      kind: "tuition_teacher",
      skills: [{ skillId: "basic_sword", level: 60 }],
      teaches: [{ skillId: "basic_sword", maxLevel: 40, tuitionSilver: 2 }],
    },
    {
      id: "senior_brother",
      name: "大师兄·凌霄",
      kind: "apprentice_master",
      sectId: "xuanmen",
      generation: 8,
      recruit: { acceptOutsiders: true, minSkills: [] },
      skills: [{ skillId: "basic_sword", level: 70 }],
      teaches: [{ skillId: "basic_sword", maxLevel: 50 }],
    },
    {
      id: "sect_master",
      name: "玄真道长",
      kind: "apprentice_master",
      sectId: "xuanmen",
      generation: 7,
      recruit: {
        acceptOutsiders: false,
        minSkills: [{ skillId: "basic_sword", level: 20 }],
      },
      skills: [{ skillId: "basic_sword", level: 80 }],
      teaches: [{ skillId: "basic_sword", maxLevel: 60 }],
    },
  ],
  items: [],
  skills: [
    {
      id: "basic_sword",
      name: "基础剑法",
      kind: "basic",
      category: "sword",
      enableSlots: [],
      maxLevel: 100,
      description: "入门剑法",
    },
    {
      id: "trivial_art",
      name: "粗浅功夫",
      kind: "basic",
      category: "parry",
      enableSlots: [],
      maxLevel: 1,
      description: "一招半式",
    },
    {
      id: "xuanmen_force",
      name: "玄门心法",
      kind: "special",
      category: "force",
      enableSlots: ["force"],
      maxLevel: 120,
      description: "吐纳",
    },
  ],
  moves: [],
  performs: [
    {
      id: "force_calm_spirit",
      skillId: "xuanmen_force",
      name: "静心回神",
      learnMinLevel: 10,
      learnRequires: [],
      cost: { qi: 0, jing: 0, neili: 18 },
      cooldownTurns: 3,
      conditions: [{ type: "self_neili_above_pct", value: 15 }],
      effect: { type: "heal_jing", amount: 22, target: "self" },
      description: "",
    },
    {
      id: "swift_slash",
      skillId: "basic_sword",
      name: "疾风斩",
      learnMinLevel: 0,
      learnRequires: [],
      cost: { qi: 0, jing: 0, neili: 10 },
      cooldownTurns: 2,
      conditions: [],
      effect: { type: "damage", amount: 20, target: "enemy" },
      description: "",
    },
  ],
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
  jingli?: number;
  neili?: number;
  food?: number;
  water?: number;
  eff_qi?: number;
  eff_jing?: number;
  last_heal_at?: string | null;
  silver: number;
  room_path: string;
  master_npc_id: string | null;
  sect_id: string | null;
  generation: number | null;
  attrs: { str: number; int: number; con: number; dex: number };
  skill_enable?: Record<string, string | null> | null;
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
    performs: [] as Array<{ character_id: string; perform_id: string }>,
    inCombat: false,
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
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
        text.includes("SELECT id, exp, potential, learned_points") &&
        text.includes("FROM characters")
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
              jingli: c.jingli ?? 100,
              neili: c.neili ?? 80,
              food: c.food ?? 100,
              water: c.water ?? 100,
              eff_qi: c.eff_qi ?? c.qi,
              eff_jing: c.eff_jing ?? c.jing,
              silver: c.silver,
              room_path: c.room_path,
              master_npc_id: c.master_npc_id,
              sect_id: c.sect_id,
              generation: c.generation,
              attrs: c.attrs,
              skill_enable: c.skill_enable ?? null,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, qi, jing, jingli, neili, food, water, eff_qi, eff_jing")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              qi: c.qi,
              jing: c.jing,
              jingli: c.jingli ?? 100,
              neili: c.neili ?? 80,
              food: c.food ?? 100,
              water: c.water ?? 100,
              eff_qi: c.eff_qi ?? c.qi,
              eff_jing: c.eff_jing ?? c.jing,
              attrs: c.attrs,
              last_heal_at: c.last_heal_at ?? new Date().toISOString(),
            })) as unknown as T[],
        };
      }
      if (text.includes("FROM combat_sessions") && text.includes("ongoing")) {
        return {
          rows: (state.inCombat ? [{ id: "combat_1" }] : []) as unknown as T[],
        };
      }
      if (text.includes("FROM character_performs") && text.includes("perform_id = $2")) {
        return {
          rows: state.performs
            .filter((p) => p.character_id === params[0] && p.perform_id === params[1])
            .map((p) => ({ perform_id: p.perform_id })) as unknown as T[],
        };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, neili = $3, eff_qi = $4, eff_jing = $5",
        )
      ) {
        const c = state.characters.find((ch) => ch.id === params[5]);
        if (c) {
          c.qi = Number(params[0]);
          c.jing = Number(params[1]);
          c.neili = Number(params[2]);
          c.eff_qi = Number(params[3]);
          c.eff_jing = Number(params[4]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET last_heal_at")) {
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT skill_id, level FROM character_skills")) {
        return {
          rows: state.skills
            .filter((s) => s.character_id === params[0])
            .map((s) => ({ skill_id: s.skill_id, level: s.level })) as unknown as T[],
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
        const c = state.characters.find((ch) => ch.id === params[3]);
        if (c) {
          c.potential -= Number(params[0]);
          c.learned_points += Number(params[0]);
          c.jing -= Number(params[1]);
          c.silver -= Number(params[2]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET master_npc_id")) {
        const c = state.characters.find((ch) => ch.id === params[3]);
        if (c) {
          c.master_npc_id = String(params[0]);
          c.sect_id = String(params[1]);
          c.generation = Number(params[2]);
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
      if (text.includes("UPDATE characters SET skill_enable")) {
        const c = state.characters.find((ch) => ch.id === params[1]);
        if (c) c.skill_enable = JSON.parse(String(params[0]));
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
    silver: 20,
    room_path: "village_dojo",
    master_npc_id: null,
    sect_id: null,
    generation: null,
    attrs: { str: 20, int: 30, con: 20, dex: 10 },
    skill_enable: null,
    ...over,
  });
  const skills = createSkillsService(db, PACK);
  return { db, state, skills };
}

describe("skillsService.enable（DC-057）", () => {
  it("卸下写入显式 null，resolve 后不被 autoEnable 补回", async () => {
    const { skills, state } = boot({ skill_enable: { force: "xuanmen_force" } });
    state.skills.push({
      character_id: "char_1",
      skill_id: "xuanmen_force",
      level: 40,
      practice_points: 0,
    });
    const cleared = await skills.enable("acc_1", { slot: "force", skillId: null });
    expect(cleared.skillEnable.force).toBeNull();
    expect(state.characters[0]!.skill_enable).toEqual({ force: null });

    const again = await skills.enable("acc_1", { slot: "force", skillId: "xuanmen_force" });
    expect(again.skillEnable.force).toBe("xuanmen_force");
  });
});

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
    expect(list).toHaveLength(3);
    expect(list?.[0]).toMatchObject({ id: "basic_sword", level: 3, practicePoints: 1 });
    expect(list?.find((s) => s.id === "trivial_art")).toMatchObject({
      id: "trivial_art",
      level: 0,
      practicePoints: 0,
    });
    expect(await skills.getSkills("acc_x")).toBeNull();
  });
});

describe("skillsService.learn（当面请教）", () => {
  it("向教头请教成功：升 1 级，扣潜能/精/银；首学精×2", async () => {
    const { skills, state } = boot();
    const res = await skills.learn("acc_1", "basic_sword", "master_wang");
    expect(res.skill).toMatchObject({ id: "basic_sword", level: 1 });
    // 150/30=5，首学 ×2 → 10；学费 2
    expect(res.spent).toEqual({ potential: 1, jing: 10, silver: 2 });
    expect(res.teacher.name).toBe("王师傅");
    const ch = state.characters[0]!;
    expect(ch.potential).toBe(99);
    expect(ch.learned_points).toBe(1);
    expect(ch.jing).toBe(490);
    expect(ch.silver).toBe(18);
  });

  it("不在同房 → not_in_room", async () => {
    const { skills } = boot({ room_path: "village_elsewhere" });
    await expect(skills.learn("acc_1", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "not_in_room",
    });
  });

  it("银两不足 → silver", async () => {
    const { skills } = boot({ silver: 1 });
    await expect(skills.learn("acc_1", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "silver",
    });
  });

  it("升到 2 级仍要历练门槛（DC-055：仅 0→1 豁免）", async () => {
    const { skills } = boot({ exp: 0 });
    await skills.learn("acc_1", "basic_sword", "master_wang");
    await expect(skills.learn("acc_1", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "exp_gate",
    });
  });

  it("潜能不足 → potential", async () => {
    const { skills } = boot({ potential: 0, learned_points: 10 });
    await expect(skills.learn("acc_1", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "potential",
    });
  });

  it("精不足 → jing", async () => {
    const { skills } = boot({ jing: 0 });
    await expect(skills.learn("acc_1", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "jing",
    });
  });

  it("门派未拜师请教 → not_apprentice；拜大师兄后只向师父请教；可改拜掌门", async () => {
    const { skills, state } = boot({ room_path: "sect_yard" });
    await expect(skills.learn("acc_1", "basic_sword", "senior_brother")).rejects.toMatchObject({
      code: "not_apprentice",
    });
    // 掌门不收门外
    const { skills: hall } = boot({ room_path: "sect_hall" });
    await expect(hall.apprentice("acc_1", "sect_master")).rejects.toMatchObject({
      code: "need_entry_master",
    });

    await skills.apprentice("acc_1", "senior_brother");
    expect(state.characters[0]?.master_npc_id).toBe("senior_brother");
    expect(state.characters[0]?.generation).toBe(9);

    const res = await skills.learn("acc_1", "basic_sword", "senior_brother");
    expect(res.spent.silver).toBe(0);
    expect(res.skill.level).toBe(1);

    // 同门但非师父不可请教
    state.characters[0]!.room_path = "sect_hall";
    await expect(skills.learn("acc_1", "basic_sword", "sect_master")).rejects.toMatchObject({
      code: "not_your_master",
    });

    // 武功不足不可改拜
    await expect(skills.apprentice("acc_1", "sect_master")).rejects.toMatchObject({
      code: "recruit_skill",
    });

    const sword = state.skills.find((s) => s.skill_id === "basic_sword");
    expect(sword).toBeTruthy();
    sword!.level = 20;
    const up = await skills.apprentice("acc_1", "sect_master");
    expect(up.generation).toBe(8);
    expect(state.characters[0]?.master_npc_id).toBe("sect_master");
    const fromMaster = await skills.learn("acc_1", "basic_sword", "sect_master");
    expect(fromMaster.skill.level).toBe(21);
  });

  it("未知武功 → skill_not_found；无角色 → no_character", async () => {
    const { skills } = boot();
    await expect(skills.learn("acc_1", "unknown_art", "master_wang")).rejects.toMatchObject({
      code: "skill_not_found",
    });
    await expect(skills.learn("acc_x", "basic_sword", "master_wang")).rejects.toMatchObject({
      code: "no_character",
    });
  });
});

describe("skillsService.apprentice", () => {
  it("向大师兄拜师成功；教头不可拜师；已拜不可再拜同人", async () => {
    const { skills, state } = boot({ room_path: "sect_yard" });
    const res = await skills.apprentice("acc_1", "senior_brother");
    expect(res.sectId).toBe("xuanmen");
    expect(res.generation).toBe(9);
    expect(state.characters[0]?.master_npc_id).toBe("senior_brother");
    await expect(skills.apprentice("acc_1", "senior_brother")).rejects.toMatchObject({
      code: "already_apprentice",
    });

    const { skills: s2 } = boot();
    await expect(s2.apprentice("acc_1", "master_wang")).rejects.toMatchObject({
      code: "cannot_apprentice",
    });
  });
});

describe("skillsService.getTeachOffer", () => {
  it("返回可教清单与报价", async () => {
    const { skills } = boot();
    const offer = await skills.getTeachOffer("acc_1", "master_wang");
    expect(offer.npc.name).toBe("王师傅");
    expect(offer.offers[0]).toMatchObject({
      skillId: "basic_sword",
      currentLevel: 0,
      nextLevel: 1,
      cost: { silver: 2, jing: 10, potential: 1 },
      canLearn: true,
    });
  });
});

describe("skillsService.practice", () => {
  it("演练一次：消耗气血并升级；进度点持久化", async () => {
    const { skills, state } = boot();
    const res = await skills.practice("acc_1", "basic_sword", 1);
    expect(res.skill.level).toBe(1);
    expect(res.leveled).toBe(true);
    expect(res.qiSpent).toBe(12);
    expect(state.characters[0]?.qi).toBe(488);
    expect(state.skills[0]).toMatchObject({ skill_id: "basic_sword", level: 1 });
  });

  it("多次演练：逐级扣气血（含等级成长成本）", async () => {
    const { skills, state } = boot();
    const res = await skills.practice("acc_1", "basic_sword", 3);
    // 12 + 13 + 13 = 38
    expect(res.qiSpent).toBe(38);
    expect(res.skill.level).toBe(2);
    expect(state.characters[0]?.qi).toBe(462);
  });

  it("气血不足 → qi；满级 → max_level；中途力竭保留已练部分", async () => {
    const { skills } = boot({ qi: 0 });
    await expect(skills.practice("acc_1", "basic_sword", 1)).rejects.toMatchObject({
      code: "qi",
    });

    // 仅够 1 次（12），不够第 2 次（再需 13）
    const { skills: s2, state } = boot({ qi: 20 });
    const res = await s2.practice("acc_1", "basic_sword", 10);
    expect(res.iterations).toBe(1);
    expect(res.qiSpent).toBe(12);
    expect(state.characters[0]?.qi).toBe(8);

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
    expect(res.jingSpent).toBe(40);
    expect(state.characters[0]?.jing).toBe(460);
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

    const noChar = await app.inject({
      method: "GET",
      url: "/skills",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(noChar.statusCode).toBe(404);

    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      exp: 1000,
      potential: 100,
      learned_points: 0,
      jing: 500,
      qi: 500,
      silver: 20,
      room_path: "village_dojo",
      master_npc_id: null,
      sect_id: null,
      generation: null,
      attrs: { str: 20, int: 30, con: 20, dex: 10 },
    });
    const list = await app.inject({
      method: "GET",
      url: "/skills",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as unknown[]).length).toBe(3);

    const learn = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: { authorization: `Bearer ${token}` },
      payload: { skillId: "basic_sword", npcId: "master_wang" },
    });
    expect(learn.statusCode).toBe(200);
    expect((learn.json() as { skill: { level: number } }).skill.level).toBe(1);

    const learnBad = await app.inject({
      method: "POST",
      url: "/skills/learn",
      headers: { authorization: `Bearer ${token}` },
      payload: { skillId: "nope", npcId: "master_wang" },
    });
    expect(learnBad.statusCode).toBe(404);
    expect((learnBad.json() as { error: { code: string } }).error).toMatchObject({
      code: "skill_not_found",
    });
  });

  it("学习错误包装为 SkillsError（供路由映射）", () => {
    expect(SkillsError).toBeDefined();
  });

  it("场外运功回精成功；伤害类与战斗中拒绝（DC-052）", async () => {
    const { db, state } = mockDb();
    const svc = createSkillsService(db, PACK);
    state.characters.push({
      id: "char_e",
      account_id: "acc_e",
      status: "active",
      exp: 100,
      potential: 50,
      learned_points: 0,
      jing: 40,
      qi: 80,
      jingli: 100,
      neili: 60,
      food: 80,
      water: 80,
      eff_qi: 100,
      eff_jing: 100,
      last_heal_at: new Date().toISOString(),
      silver: 10,
      room_path: "village_dojo",
      master_npc_id: null,
      sect_id: null,
      generation: null,
      attrs: { str: 20, int: 20, con: 20, dex: 20 },
    });
    state.skills.push({
      character_id: "char_e",
      skill_id: "xuanmen_force",
      level: 20,
      practice_points: 0,
    });
    state.performs.push({ character_id: "char_e", perform_id: "force_calm_spirit" });

    const ok = await svc.exert("acc_e", "force_calm_spirit");
    expect(ok.kind).toBe("heal_jing");
    expect(ok.vitals.jing).toBeGreaterThan(40);
    expect(ok.vitals.neili).toBe(42);

    await expect(svc.exert("acc_e", "swift_slash")).rejects.toMatchObject({
      code: "not_field_exert",
    });

    state.inCombat = true;
    await expect(svc.exert("acc_e", "force_calm_spirit")).rejects.toMatchObject({
      code: "in_combat",
    });
  });
});
