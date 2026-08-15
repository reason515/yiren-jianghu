import { describe, expect, it } from "vitest";
import {
  ATTR_BUDGET,
  CharacterError,
  createCharacterService,
  validateAttrs,
} from "./characterService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

type CharacterRow = {
  id: string;
  account_id: string;
  name: string;
  gender: string;
  status: string;
  attrs: string;
  room_path: string;
  exp?: number;
  potential?: number;
  learned_points?: number;
  silver?: number;
  qi?: number;
  jing?: number;
  jingli?: number;
  neili?: number;
  eff_qi?: number;
  eff_jing?: number;
  last_heal_at?: string | null;
  skill_enable?: Record<string, string> | null;
};

/** 内存 mock DB：具体的角色详情 SELECT 必须在单角色检查分支之前。 */
function mockDb() {
  const state = {
    characters: [] as CharacterRow[],
    skills: [] as Array<{ id: string; character_id: string; skill_id: string; level: number }>,
    items: [] as Array<{
      character_id: string;
      item_def_id: string;
      quantity: number;
      slot: string | null;
    }>,
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      if (text.includes("SELECT skill_id, level FROM character_skills")) {
        return {
          rows: state.skills
            .filter((skill) => skill.character_id === params[0])
            .map((skill) => ({ skill_id: skill.skill_id, level: skill.level })) as unknown as T[],
        };
      }
      if (text.includes("eff_qi, eff_jing, attrs, last_heal_at")) {
        return {
          rows: state.characters
            .filter(
              (character) => character.account_id === params[0] && character.status === "active",
            )
            .map((character) => ({
              id: character.id,
              qi: character.qi ?? 100,
              jing: character.jing ?? 100,
              jingli: character.jingli ?? 100,
              neili: character.neili ?? 0,
              eff_qi: character.eff_qi ?? character.qi ?? 100,
              eff_jing: character.eff_jing ?? character.jing ?? 100,
              attrs: character.attrs,
              last_heal_at: character.last_heal_at ?? new Date().toISOString(),
            })) as unknown as T[],
        };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, jingli = $3, neili = $4, eff_qi = $5, eff_jing = $6",
        )
      ) {
        const character = state.characters.find((row) => row.id === params[6]);
        if (character) {
          character.qi = Number(params[0]);
          character.jing = Number(params[1]);
          character.jingli = Number(params[2]);
          character.neili = Number(params[3]);
          character.eff_qi = Number(params[4]);
          character.eff_jing = Number(params[5]);
          character.last_heal_at = new Date().toISOString();
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET last_heal_at = now()")) {
        const character = state.characters.find((row) => row.id === params[0]);
        if (character) character.last_heal_at = new Date().toISOString();
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT id, name, gender, status, attrs, exp")) {
        return {
          rows: state.characters
            .filter(
              (character) => character.account_id === params[0] && character.status === "active",
            )
            .map((character) => ({
              id: character.id,
              name: character.name,
              gender: character.gender,
              status: character.status,
              attrs: character.attrs,
              exp: character.exp ?? 0,
              potential: character.potential ?? 0,
              learned_points: character.learned_points ?? 0,
              silver: character.silver ?? 0,
              qi: character.qi ?? 100,
              jing: character.jing ?? 100,
              jingli: character.jingli ?? 100,
              neili: character.neili ?? 0,
              master_npc_id: null,
              sect_id: null,
              generation: null,
              skill_enable: character.skill_enable ?? null,
            })) as unknown as T[],
        };
      }
      if (text.includes("FROM characters WHERE account_id") && text.includes("status = 'active'")) {
        return {
          rows: state.characters
            .filter(
              (character) => character.account_id === params[0] && character.status === "active",
            )
            .map((character) => ({ id: character.id })) as unknown as T[],
        };
      }
      if (text.includes("FROM characters WHERE name")) {
        return {
          rows: state.characters
            .filter((character) => character.name === params[0] && character.id !== params[1])
            .map((character) => ({ id: character.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO characters")) {
        const id = `char_${state.characters.length + 1}`;
        state.characters.push({
          id,
          account_id: String(params[0]),
          name: String(params[1]),
          gender: String(params[2]),
          attrs: String(params[3]),
          room_path: String(params[4]),
          silver: Number(params[5] ?? 10),
          potential: Number(params[6] ?? 0),
          status: "active",
        });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO character_items")) {
        state.items.push({
          character_id: String(params[0]),
          item_def_id: String(params[1]),
          quantity: 1,
          slot: String(params[2]),
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET status = 'discarded'")) {
        const character = state.characters.find(
          (candidate) => candidate.account_id === params[0] && candidate.status === "active",
        );
        if (character) {
          character.status = "discarded";
          return { rows: [{ id: character.id }] as unknown as T[] };
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET name")) {
        const character = state.characters.find((candidate) => candidate.id === params[1]);
        if (character) {
          character.name = String(params[0]);
          return { rows: [{ name: character.name }] as unknown as T[] };
        }
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

const ATTRS = { str: 25, int: 20, con: 20, dex: 15 };
const INPUT = { name: "陆小风", gender: "male" as const, attrs: ATTRS };

/** 最小内容包 stub：仅 vitals 参数 + 技能表（computeMaxVitals 只读 params.vitals）。 */
const CONTENT = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  skills: [
    {
      id: "xuanmen_force",
      name: "玄门心法",
      kind: "special",
      category: "force",
      enableSlots: ["force"],
    },
    { id: "basic_sword", name: "基础剑法", kind: "basic", category: "sword", enableSlots: [] },
  ],
  moves: [],
  performs: [],
  npcs: [],
  items: [],
} as unknown as ContentPack;

describe("validateAttrs", () => {
  it("仅允许 10–30 的整数，且总和固定为 80", () => {
    expect(validateAttrs(ATTRS)).toBeNull();
    expect(validateAttrs({ str: 40, int: 20, con: 10, dex: 10 })).toContain("10–30");
    expect(validateAttrs({ str: 20, int: 20, con: 20, dex: 19 })).toContain(`${ATTR_BUDGET}`);
    expect(validateAttrs({ str: 20.5, int: 20, con: 20, dex: 19.5 })).toContain("整数");
  });
});

describe("characterService", () => {
  it("创建角色并返回人物簿所需的属性、行止和有效潜能", async () => {
    const { db, state } = mockDb();
    const service = createCharacterService(db, CONTENT);
    await service.createCharacter("acc_1", INPUT);
    expect(state.characters[0]).toMatchObject({ room_path: "village_start", name: "陆小风" });
    expect(state.items).toEqual([
      { character_id: "char_1", item_def_id: "cubu_yi", quantity: 1, slot: "armor" },
      { character_id: "char_1", item_def_id: "iron_sword", quantity: 1, slot: "weapon" },
    ]);
    expect(await service.getCharacter("acc_1")).toMatchObject({
      name: "陆小风",
      attrs: { str: { cur: 25, base: 25 } },
      vitals: { qi: 210, jing: 210, jingli: 50, neili: 0 },
      effectivePotential: 10,
    });
  });

  it("返回生存资源上限（与当前值成对，供顶栏展示）", async () => {
    const { db, state } = mockDb();
    const service = createCharacterService(db, CONTENT);
    await service.createCharacter("acc_1", INPUT);
    const character = await service.getCharacter("acc_1");
    // 无内功时：maxQi = 50 + 20*8 = 210；maxJing = 50 + 20*8 = 210；
    // maxJingli = 50；maxNeili = 0
    expect(character?.vitalsMax).toEqual({
      qi: 210,
      jing: 210,
      jingli: 50,
      neili: 0,
    });
    // 有内功时内力/气血随等级增长
    state.skills.push({
      id: "cs_1",
      character_id: state.characters[0]!.id,
      skill_id: "xuanmen_force",
      level: 10,
    });
    const withForce = await service.getCharacter("acc_1");
    // neili=10*8=80；jingli=50+10*2=70
    expect(withForce?.vitalsMax).toMatchObject({ neili: 80, jingli: 70 });
  });

  it("快照含六槎有效等级（DC-056）", async () => {
    const { db, state } = mockDb();
    const service = createCharacterService(db, CONTENT);
    await service.createCharacter("acc_1", INPUT);
    const fresh = await service.getCharacter("acc_1");
    expect(fresh?.effective).toEqual({
      force: 0,
      dodge: 0,
      parry: 0,
      unarmed: 0,
      sword: 0,
      blade: 0,
    });
    state.skills.push(
      {
        id: "cs_force",
        character_id: state.characters[0]!.id,
        skill_id: "xuanmen_force",
        level: 10,
      },
      {
        id: "cs_sword",
        character_id: state.characters[0]!.id,
        skill_id: "basic_sword",
        level: 20,
      },
    );
    const withSkills = await service.getCharacter("acc_1");
    // 内功：自动激发玄门心法 → 0/2+10；剑法：基本 20/2+0
    expect(withSkills?.effective).toMatchObject({ force: 10, sword: 10 });
    expect(withSkills?.skillEnable?.force).toBe("xuanmen_force");
  });

  it("拒绝已有角色、重复名号和不合规属性", async () => {
    const { db } = mockDb();
    const service = createCharacterService(db);
    await service.createCharacter("acc_1", INPUT);
    await expect(
      service.createCharacter("acc_1", { ...INPUT, name: "李四" }),
    ).rejects.toMatchObject({
      code: "already_has_character",
    });
    await expect(service.createCharacter("acc_2", INPUT)).rejects.toMatchObject({
      code: "name_taken",
    });
    await expect(
      service.createCharacter("acc_2", { ...INPUT, attrs: { str: 10, int: 10, con: 10, dex: 10 } }),
    ).rejects.toMatchObject({ code: "invalid_attrs" });
  });

  it("放弃后不再可见，且可重新立名", async () => {
    const { db } = mockDb();
    const service = createCharacterService(db);
    const first = await service.createCharacter("acc_1", INPUT);
    expect(await service.discardCharacter("acc_1")).toBe(true);
    expect(await service.getCharacter("acc_1")).toBeNull();
    const next = await service.createCharacter("acc_1", { ...INPUT, name: "风满楼" });
    expect(next.characterId).not.toBe(first.characterId);
    expect(await service.discardCharacter("acc_1")).toBe(true);
    expect(await service.discardCharacter("acc_1")).toBe(false);
  });

  it("改名校验归属、长度和唯一性", async () => {
    const { db, state } = mockDb();
    const service = createCharacterService(db);
    await service.createCharacter("acc_1", INPUT);
    state.characters.push({
      id: "char_other",
      account_id: "acc_other",
      name: "他人名号",
      gender: "male",
      attrs: "{}",
      room_path: "village_start",
      status: "active",
    });
    await expect(service.updateName("acc_x", "新名")).rejects.toMatchObject({
      code: "no_character",
    });
    await expect(service.updateName("acc_1", "")).rejects.toMatchObject({ code: "invalid_name" });
    await expect(service.updateName("acc_1", "他人名号")).rejects.toMatchObject({
      code: "name_taken",
    });
    await expect(service.updateName("acc_1", "风满楼")).resolves.toEqual({ name: "风满楼" });
  });

  it("业务错误保留可判别类型", () => {
    expect(new CharacterError("x", "y")).toBeInstanceOf(CharacterError);
  });
});
