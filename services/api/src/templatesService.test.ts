import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { TemplatesError, createTemplatesService, MAX_TEMPLATES } from "./templatesService.js";
import { DEFAULT_PARAMS, type TacticTemplate } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";

const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [],
  skills: [
    {
      id: "basic_sword",
      name: "基础剑法",
      kind: "basic",
      category: "sword",
      enableSlots: [],
      maxLevel: 100,
    },
  ],
  performs: [
    {
      id: "swift_slash",
      skillId: "basic_sword",
      name: "疾风斩",
      cost: { qi: 0, jing: 0, neili: 0 },
      cooldownTurns: 3,
      conditions: [],
      effect: { type: "damage", amount: 15, target: "enemy" },
      description: "剑未至，风先裂。",
    },
  ],
  quests: [],
  story: [],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
}

interface SkillState {
  character_id: string;
  skill_id: string;
  level: number;
  practice_points: number;
}

interface TplState {
  id: string;
  character_id: string;
  name: string;
  config: string;
  is_default_pvp: boolean;
  updated_at: string;
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    skills: [] as SkillState[],
    templates: [] as TplState[],
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
      if (text.includes("SELECT id FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id })) as unknown as T[],
        };
      }
      if (text.includes("FROM character_skills")) {
        return {
          rows: state.skills
            .filter((s) => s.character_id === params[0])
            .map((s) => ({ skill_id: s.skill_id, level: s.level })) as unknown as T[],
        };
      }
      if (text.includes("SELECT count(*)::text AS n FROM tactic_templates")) {
        const n = state.templates.filter((t) => t.character_id === params[0]).length;
        return { rows: [{ n: String(n) }] as unknown as T[] };
      }
      if (
        text.includes("SELECT id, name, config, is_default_pvp, updated_at FROM tactic_templates")
      ) {
        const list = text.includes("WHERE id = $1 AND character_id = $2")
          ? state.templates.filter((t) => t.id === params[0] && t.character_id === params[1])
          : state.templates.filter((t) => t.character_id === params[0]);
        return {
          rows: list.map((t) => ({
            id: t.id,
            name: t.name,
            config: t.config,
            is_default_pvp: t.is_default_pvp,
            updated_at: t.updated_at,
          })) as unknown as T[],
        };
      }
      if (text.includes("UPDATE tactic_templates SET is_default_pvp = false")) {
        for (const t of state.templates) {
          if (t.character_id === params[0] && t.id !== params[1]) t.is_default_pvp = false;
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE tactic_templates SET name")) {
        const t = state.templates.find((x) => x.id === params[3] && x.character_id === params[4]);
        if (t) {
          t.name = String(params[0]);
          t.config = String(params[1]);
          t.is_default_pvp = Boolean(params[2]);
        }
        return {
          rows: t
            ? ([
                {
                  id: t.id,
                  name: t.name,
                  config: t.config,
                  is_default_pvp: t.is_default_pvp,
                  updated_at: t.updated_at,
                },
              ] as unknown as T[])
            : ([] as unknown as T[]),
        };
      }
      if (text.includes("DELETE FROM tactic_templates")) {
        const idx = state.templates.findIndex(
          (x) => x.id === params[0] && x.character_id === params[1],
        );
        const deleted = idx >= 0 ? state.templates.splice(idx, 1) : [];
        return { rows: deleted.map((d) => ({ id: d.id })) as unknown as T[] };
      }
      if (text.includes("INSERT INTO tactic_templates")) {
        const tpl: TplState = {
          id: `tpl_${state.templates.length + 1}`,
          character_id: String(params[0]),
          name: String(params[1]),
          config: String(params[2]),
          is_default_pvp: Boolean(params[3]),
          updated_at: "2026-08-07T00:00:00.000Z",
        };
        state.templates.push(tpl);
        return {
          rows: [
            {
              id: tpl.id,
              name: tpl.name,
              config: tpl.config,
              is_default_pvp: tpl.is_default_pvp,
              updated_at: tpl.updated_at,
            },
          ] as unknown as T[],
        };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

const VALID_CONFIG: TacticTemplate = {
  version: 1,
  rules: [
    {
      id: "r1",
      conditions: [{ type: "self_qi_below_pct", value: 30 }],
      action: { type: "recover" },
    },
  ],
  defaultAction: { type: "attack" },
};

function boot() {
  const { db, state } = mockDb();
  state.characters.push({ id: "char_1", account_id: "acc_1", status: "active" });
  state.skills.push({
    character_id: "char_1",
    skill_id: "basic_sword",
    level: 5,
    practice_points: 0,
  });
  const templates = createTemplatesService(db, PACK);
  return { db, state, templates };
}

describe("templatesService.list", () => {
  it("列出角色全部战术；无角色 null", async () => {
    const { templates, state } = boot();
    state.templates.push({
      id: "tpl_1",
      character_id: "char_1",
      name: "稳健",
      config: JSON.stringify(VALID_CONFIG),
      is_default_pvp: true,
      updated_at: "2026-08-07T00:00:00.000Z",
    });
    const list = await templates.list("acc_1");
    expect(list).toHaveLength(1);
    expect(list?.[0]).toMatchObject({ id: "tpl_1", name: "稳健", isDefaultPvp: true });
    expect(await templates.list("acc_x")).toBeNull();
  });
});

describe("templatesService.create", () => {
  it("创建成功：tactic Schema 校验通过，返回视图", async () => {
    const { templates, state } = boot();
    const view = await templates.create("acc_1", { name: "稳健", config: VALID_CONFIG });
    expect(view).toMatchObject({ name: "稳健", isDefaultPvp: false });
    expect(state.templates).toHaveLength(1);
    expect(JSON.parse(state.templates[0]!.config)).toEqual(VALID_CONFIG);
  });

  it("Schema 不合规 → invalid_config；语义错误（未知绝招/未知技能）→ invalid_tactic", async () => {
    const { templates } = boot();
    await expect(
      templates.create("acc_1", {
        name: "坏模板",
        config: {
          version: 1,
          rules: [{ id: "r1", action: { type: "nope" } }],
        } as unknown as TacticTemplate,
      }),
    ).rejects.toMatchObject({ code: "invalid_config" });

    await expect(
      templates.create("acc_1", {
        name: "绝招缺失",
        config: {
          version: 1,
          rules: [{ id: "r1", conditions: [], action: { type: "perform", performId: "ghost" } }],
          defaultAction: { type: "attack" },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_tactic" });

    await expect(
      templates.create("acc_1", {
        name: "技能门槛",
        config: {
          version: 1,
          rules: [
            {
              id: "r1",
              conditions: [{ type: "skill_level_at_least", skillId: "mystery_art", value: 10 }],
              action: { type: "attack" },
            },
          ],
          defaultAction: { type: "attack" },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_tactic" });
  });

  it("模板数上限 → too_many；名号超长 → invalid_name", async () => {
    const { templates, state } = boot();
    for (let i = 0; i < MAX_TEMPLATES; i++) {
      state.templates.push({
        id: `tpl_${i}`,
        character_id: "char_1",
        name: `模板${i}`,
        config: "{}",
        is_default_pvp: false,
        updated_at: "2026-08-07T00:00:00.000Z",
      });
    }
    await expect(
      templates.create("acc_1", { name: "超限", config: VALID_CONFIG }),
    ).rejects.toMatchObject({ code: "too_many" });
    await expect(
      templates.create("acc_1", { name: "一个特别特别特别长的模板名字", config: VALID_CONFIG }),
    ).rejects.toMatchObject({ code: "invalid_name" });
  });

  it("设为论剑默认时清掉旧默认（唯一性）", async () => {
    const { templates, state } = boot();
    await templates.create("acc_1", { name: "甲", config: VALID_CONFIG, isDefaultPvp: true });
    await templates.create("acc_1", { name: "乙", config: VALID_CONFIG, isDefaultPvp: true });
    const list = await templates.list("acc_1");
    expect(list?.filter((t) => t.isDefaultPvp)).toHaveLength(1);
    expect(list?.find((t) => t.name === "乙")?.isDefaultPvp).toBe(true);
    expect(state.templates[0]?.is_default_pvp).toBe(false);
  });
});

describe("templatesService.update", () => {
  it("更新成功；非本人模板 → not_found", async () => {
    const { templates, state } = boot();
    state.characters.push({ id: "char_2", account_id: "acc_2", status: "active" });
    state.templates.push({
      id: "tpl_1",
      character_id: "char_1",
      name: "旧",
      config: JSON.stringify(VALID_CONFIG),
      is_default_pvp: false,
      updated_at: "2026-08-07T00:00:00.000Z",
    });
    const view = await templates.update("acc_1", "tpl_1", {
      name: "新",
      config: VALID_CONFIG,
      isDefaultPvp: true,
    });
    expect(view).toMatchObject({ name: "新", isDefaultPvp: true });
    expect(state.templates[0]?.name).toBe("新");

    await expect(
      templates.update("acc_2", "tpl_1", { name: "x", config: VALID_CONFIG }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      templates.update("acc_1", "tpl_missing", { name: "x", config: VALID_CONFIG }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("templatesService.remove", () => {
  it("删除成功；非本人/不存在 → not_found", async () => {
    const { templates, state } = boot();
    state.templates.push({
      id: "tpl_1",
      character_id: "char_1",
      name: "删我",
      config: JSON.stringify(VALID_CONFIG),
      is_default_pvp: false,
      updated_at: "2026-08-07T00:00:00.000Z",
    });
    await templates.remove("acc_1", "tpl_1");
    expect(state.templates).toHaveLength(0);
    await expect(templates.remove("acc_1", "tpl_1")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(templates.remove("acc_x", "tpl_1")).rejects.toMatchObject({
      code: "no_character",
    });
  });
});

describe("app 集成（templates 路由）", () => {
  it("GET/POST /templates 与 PUT/DELETE /templates/:id 全链路", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };
    state.characters.push({ id: "char_1", account_id: "acc_1", status: "active" });
    state.skills.push({
      character_id: "char_1",
      skill_id: "basic_sword",
      level: 5,
      practice_points: 0,
    });

    const create = await app.inject({
      method: "POST",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "稳健", config: VALID_CONFIG, isDefaultPvp: true },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json() as { id: string; name: string };
    expect(created.name).toBe("稳健");

    const list = await app.inject({
      method: "GET",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect((list.json() as unknown[]).length).toBe(1);

    const upd = await app.inject({
      method: "PUT",
      url: `/templates/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "进取", config: VALID_CONFIG },
    });
    expect(upd.statusCode).toBe(200);
    expect((upd.json() as { name: string }).name).toBe("进取");

    const bad = await app.inject({
      method: "PUT",
      url: "/templates/nope",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "x", config: VALID_CONFIG },
    });
    expect(bad.statusCode).toBe(404);
    expect((bad.json() as { error: { code: string } }).error.code).toBe("not_found");

    const del = await app.inject({
      method: "DELETE",
      url: `/templates/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
  });

  it("TemplatesError 类型存在（路由映射依赖）", () => {
    expect(TemplatesError).toBeDefined();
  });
});
