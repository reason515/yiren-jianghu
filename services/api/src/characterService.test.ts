import { describe, expect, it } from "vitest";
import {
  createCharacterService,
  CharacterError,
  validateAttrs,
  ATTR_BUDGET,
} from "./characterService.js";
import type { Db, DbRow } from "./db.js";

/** 内存 mock DB：扩展支持 characters 表。 */
function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as Array<{
      id: string;
      account_id: string;
      name: string;
      gender: string;
      status: string;
      attrs?: string;
      room_path?: string;
    }>,
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
      // characters 域（顺序：更具体的 SELECT 在前，避免被单角色检查分支吞掉）
      if (text.includes("SELECT id, name, gender, status FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              name: c.name,
              gender: c.gender,
              status: c.status,
            })) as unknown as T[],
        };
      }
      if (text.includes("FROM characters WHERE account_id") && text.includes("status = 'active'")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id })) as unknown as T[],
        };
      }
      if (text.includes("FROM characters WHERE name")) {
        return {
          rows: state.characters
            .filter((c) => c.name === params[0])
            .map((c) => ({ id: c.id })) as unknown as T[],
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
        const target = state.characters.find(
          (c) => c.account_id === params[0] && c.status === "active",
        );
        if (target) {
          target.status = "discarded";
          return { rows: [{ id: target.id }] as unknown as T[] };
        }
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

const ATTRS = { str: 25, int: 20, con: 20, dex: 15 };
const INPUT = { name: "陆小风", gender: "male" as const, attrs: ATTRS };

describe("validateAttrs", () => {
  it("总和 80 且每项 10–30 通过；越界/非整数/总和不对拒绝", () => {
    expect(validateAttrs(ATTRS)).toBeNull();
    expect(validateAttrs({ str: 40, int: 20, con: 10, dex: 10 })).toContain("10–30");
    expect(validateAttrs({ str: 20, int: 20, con: 20, dex: 19 })).toContain(`${ATTR_BUDGET}`);
    expect(validateAttrs({ str: 20.5, int: 20, con: 20, dex: 19.5 })).toContain("整数");
  });
});

describe("characterService.createCharacter", () => {
  it("成功创建并落初始房间；名号/属性校验", async () => {
    const { db, state } = mockDb();
    const svc = createCharacterService(db);
    const { characterId } = await svc.createCharacter("acc_1", INPUT);
    expect(characterId).toBeTruthy();
    expect(state.characters[0]).toMatchObject({
      account_id: "acc_1",
      name: "陆小风",
      status: "active",
      room_path: "village_start",
    });
    expect(state.characters[0]?.attrs).toContain("25");
  });

  it("单角色约束：已有 active 角色拒绝；名号重复拒绝", async () => {
    const { db } = mockDb();
    const svc = createCharacterService(db);
    await svc.createCharacter("acc_1", INPUT);
    await expect(svc.createCharacter("acc_1", { ...INPUT, name: "李四" })).rejects.toMatchObject({
      code: "already_has_character",
    });
    await expect(svc.createCharacter("acc_2", { ...INPUT, name: "陆小风" })).rejects.toMatchObject({
      code: "name_taken",
    });
    await expect(
      svc.createCharacter("acc_2", { ...INPUT, attrs: { str: 10, int: 10, con: 10, dex: 10 } }),
    ).rejects.toMatchObject({ code: "invalid_attrs" });
    await expect(
      svc.createCharacter("acc_2", { ...INPUT, name: "一二三四五六七八九" }),
    ).rejects.toMatchObject({ code: "invalid_name" });
  });

  it("放弃角色后再建（冻结旧档，active 可重建）", async () => {
    const { db, state } = mockDb();
    const svc = createCharacterService(db);
    const { characterId } = await svc.createCharacter("acc_1", INPUT);
    expect(await svc.discardCharacter("acc_1")).toBe(true);
    expect(state.characters[0]?.status).toBe("discarded");
    const again = await svc.createCharacter("acc_1", { ...INPUT, name: "小风再战" });
    expect(again.characterId).not.toBe(characterId);
    expect(state.characters.length).toBe(2);
  });
});

describe("characterService.getCharacter / discardCharacter", () => {
  it("无角色返回 null；放弃后不可见", async () => {
    const { db } = mockDb();
    const svc = createCharacterService(db);
    expect(await svc.getCharacter("acc_x")).toBeNull();
    await svc.createCharacter("acc_1", INPUT);
    expect(await svc.getCharacter("acc_1")).toMatchObject({ name: "陆小风", status: "active" });
    await svc.discardCharacter("acc_1");
    expect(await svc.getCharacter("acc_1")).toBeNull();
    expect(await svc.discardCharacter("acc_1")).toBe(false);
  });
});

describe("CharacterError instanceof", () => {
  it("可被 instanceof 捕获", () => {
    expect(new CharacterError("x", "y")).toBeInstanceOf(CharacterError);
  });
});
