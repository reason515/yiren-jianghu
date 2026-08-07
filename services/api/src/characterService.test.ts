import { describe, expect, it } from "vitest";
import {
  ATTR_BUDGET,
  CharacterError,
  createCharacterService,
  validateAttrs,
} from "./characterService.js";
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
  food?: number;
  water?: number;
};

/** 内存 mock DB：具体的角色详情 SELECT 必须在单角色检查分支之前。 */
function mockDb() {
  const state = { characters: [] as CharacterRow[] };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
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
              food: character.food ?? 300,
              water: character.water ?? 300,
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
          status: "active",
        });
        return { rows: [{ id }] as unknown as T[] };
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
    const service = createCharacterService(db);
    await service.createCharacter("acc_1", INPUT);
    expect(state.characters[0]).toMatchObject({ room_path: "village_start", name: "陆小风" });
    expect(await service.getCharacter("acc_1")).toMatchObject({
      name: "陆小风",
      attrs: { str: { cur: 25, base: 25 } },
      vitals: { qi: 100, jing: 100, food: 300 },
      effectivePotential: 0,
    });
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
