import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { SceneError, buildContentIndex, createSceneService } from "./sceneService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [
    { id: "iron_sword", name: "铁剑", kind: "weapon", value: 20, stackable: false },
    { id: "leather_armor", name: "皮甲", kind: "armor", value: 30, stackable: false },
    {
      id: "jinchuang_yao",
      name: "金疮药",
      kind: "drug",
      value: 5,
      stackable: true,
      usable: { effect: "heal_qi", amount: 50 },
    },
    {
      id: "dry_food",
      name: "干粮",
      kind: "food",
      value: 2,
      stackable: true,
      usable: { effect: "feed", amount: 30 },
    },
    {
      id: "clear_water",
      name: "清水",
      kind: "food",
      value: 1,
      stackable: true,
      usable: { effect: "quench", amount: 30 },
    },
    { id: "herbs", name: "药草", kind: "misc", value: 1, stackable: true },
  ],
  skills: [],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
  qi: number;
  jing: number;
  neili: number;
  food: number;
  water: number;
  eff_qi: number;
  eff_jing: number;
  attrs: { str: number; int: number; con: number; dex: number };
}

interface ItemState {
  id: string;
  character_id: string;
  item_def_id: string;
  quantity: number;
  slot: string | null;
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    items: [] as ItemState[],
    skills: [] as Array<{ character_id: string; skill_id: string; level: number }>,
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
      if (text.includes("SELECT id, room_path FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id, room_path: "village_start" })) as unknown as T[],
        };
      }
      if (
        text.includes(
          "SELECT id, qi, jing, neili, food, water, eff_qi, eff_jing, attrs FROM characters",
        )
      ) {
        return {
          rows: state.characters
            .filter((c) => c.id === params[0])
            .map((c) => ({
              id: c.id,
              qi: c.qi,
              jing: c.jing,
              neili: c.neili,
              food: c.food,
              water: c.water,
              eff_qi: c.eff_qi,
              eff_jing: c.eff_jing,
              attrs: c.attrs,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, qi, jing, neili, food, water, attrs FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.id === params[0])
            .map((c) => ({
              id: c.id,
              qi: c.qi,
              jing: c.jing,
              neili: c.neili,
              food: c.food,
              water: c.water,
              attrs: c.attrs,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, item_def_id, quantity, slot FROM character_items")) {
        return {
          rows: state.items
            .filter((i) => i.character_id === params[0])
            .map((i) => ({
              id: i.id,
              item_def_id: i.item_def_id,
              quantity: i.quantity,
              slot: i.slot,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, item_def_id, slot FROM character_items")) {
        return {
          rows: state.items
            .filter((i) => i.id === params[0] && i.character_id === params[1])
            .map((i) => ({ id: i.id, item_def_id: i.item_def_id, slot: i.slot })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, item_def_id, quantity FROM character_items")) {
        return {
          rows: state.items
            .filter((i) => i.id === params[0] && i.character_id === params[1])
            .map((i) => ({
              id: i.id,
              item_def_id: i.item_def_id,
              quantity: i.quantity,
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, slot FROM character_items")) {
        return {
          rows: state.items
            .filter((i) => i.id === params[0] && i.character_id === params[1])
            .map((i) => ({ id: i.id, slot: i.slot })) as unknown as T[],
        };
      }
      if (
        text.includes("UPDATE character_items SET slot = NULL WHERE character_id") &&
        text.includes("id <> $3")
      ) {
        for (const i of state.items) {
          if (i.character_id === params[0] && i.slot === params[1] && i.id !== params[2]) {
            i.slot = null;
          }
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE character_items SET slot = $1")) {
        const i = state.items.find((x) => x.id === params[1] && x.character_id === params[2]);
        if (i) i.slot = String(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE character_items SET slot = NULL WHERE id")) {
        const i = state.items.find((x) => x.id === params[0] && x.character_id === params[1]);
        if (i) i.slot = null;
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT skill_id, level FROM character_skills")) {
        return {
          rows: state.skills
            .filter((s) => s.character_id === params[0])
            .map((s) => ({ skill_id: s.skill_id, level: s.level })) as unknown as T[],
        };
      }
      if (text.includes("UPDATE characters SET qi = $1")) {
        const withEff = text.includes("eff_qi");
        const c = state.characters.find((x) => x.id === params[withEff ? 7 : 5]);
        if (c) {
          c.qi = Number(params[0]);
          c.jing = Number(params[1]);
          c.neili = Number(params[2]);
          c.food = Number(params[3]);
          c.water = Number(params[4]);
          if (withEff) {
            c.eff_qi = Number(params[5]);
            c.eff_jing = Number(params[6]);
          }
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE character_items SET quantity = quantity - 1")) {
        const i = state.items.find((x) => x.id === params[0]);
        if (i) i.quantity -= 1;
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("DELETE FROM character_items")) {
        const idx = state.items.findIndex((i) => i.id === params[0]);
        if (idx >= 0) state.items.splice(idx, 1);
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot() {
  const { db, state } = mockDb();
  state.characters.push({
    id: "char_1",
    account_id: "acc_1",
    status: "active",
    qi: 100,
    jing: 100,
    neili: 0,
    food: 100,
    water: 100,
    eff_qi: 500,
    eff_jing: 500,
    attrs: { str: 25, int: 20, con: 20, dex: 15 },
  });
  state.items.push(
    { id: "it_sword", character_id: "char_1", item_def_id: "iron_sword", quantity: 1, slot: null },
    {
      id: "it_armor",
      character_id: "char_1",
      item_def_id: "leather_armor",
      quantity: 1,
      slot: null,
    },
    { id: "it_yao", character_id: "char_1", item_def_id: "jinchuang_yao", quantity: 2, slot: null },
    { id: "it_food", character_id: "char_1", item_def_id: "dry_food", quantity: 1, slot: null },
    { id: "it_water", character_id: "char_1", item_def_id: "clear_water", quantity: 1, slot: null },
    { id: "it_herbs", character_id: "char_1", item_def_id: "herbs", quantity: 1, slot: null },
  );
  const scene = createSceneService(db, buildContentIndex(PACK));
  return { db, state, scene };
}

describe("sceneService.equip", () => {
  it("装备武器/护甲：按 kind 落槽，同槽替换卸下旧物", async () => {
    const { scene, state } = boot();
    await scene.equip("acc_1", "it_sword");
    expect(state.items.find((i) => i.id === "it_sword")?.slot).toBe("weapon");

    // 第二把剑替换第一把
    state.items.push({
      id: "it_sword2",
      character_id: "char_1",
      item_def_id: "iron_sword",
      quantity: 1,
      slot: null,
    });
    await scene.equip("acc_1", "it_sword2");
    expect(state.items.find((i) => i.id === "it_sword")?.slot).toBeNull();
    expect(state.items.find((i) => i.id === "it_sword2")?.slot).toBe("weapon");

    await scene.equip("acc_1", "it_armor");
    expect(state.items.find((i) => i.id === "it_armor")?.slot).toBe("armor");
  });

  it("非装备类 → cannot_equip；已装备 → already_equipped；无此物 → item_not_found", async () => {
    const { scene } = boot();
    await expect(scene.equip("acc_1", "it_herbs")).rejects.toMatchObject({
      code: "cannot_equip",
    });
    await scene.equip("acc_1", "it_sword");
    await expect(scene.equip("acc_1", "it_sword")).rejects.toMatchObject({
      code: "already_equipped",
    });
    await expect(scene.equip("acc_1", "it_nope")).rejects.toMatchObject({ code: "item_not_found" });
    await expect(scene.equip("acc_x", "it_sword")).rejects.toMatchObject({ code: "no_character" });
  });
});

describe("sceneService.unequip", () => {
  it("卸下成功；未装备/无此物拒绝", async () => {
    const { scene, state } = boot();
    await scene.equip("acc_1", "it_sword");
    await scene.unequip("acc_1", "it_sword");
    expect(state.items.find((i) => i.id === "it_sword")?.slot).toBeNull();

    await expect(scene.unequip("acc_1", "it_sword")).rejects.toMatchObject({
      code: "not_equipped",
    });
    await expect(scene.unequip("acc_1", "it_nope")).rejects.toMatchObject({
      code: "item_not_found",
    });
  });
});

describe("sceneService.useItem", () => {
  it("金疮药回气血并按上限钳制；数量递减；最后一个删除", async () => {
    const { scene, state } = boot();
    const res = await scene.useItem("acc_1", "it_yao");
    expect(res).toEqual({ ok: true, effect: "heal_qi" });
    // maxQi = 50 + 20*8 = 210；100 + 50 = 150（未触顶）
    expect(state.characters[0]?.qi).toBe(150);
    expect(state.items.find((i) => i.id === "it_yao")?.quantity).toBe(1);

    await scene.useItem("acc_1", "it_yao");
    expect(state.items.find((i) => i.id === "it_yao")).toBeUndefined(); // 用完删除
  });

  it("干粮补食物（上限钳制）；非可用物 → cannot_use", async () => {
    const { scene, state } = boot();
    await scene.useItem("acc_1", "it_food");
    // maxFood = 100 + 20*5 = 200；100 + 30 = 130（未触顶）
    expect(state.characters[0]?.food).toBe(130);

    await expect(scene.useItem("acc_1", "it_herbs")).rejects.toMatchObject({
      code: "cannot_use",
    });
    await expect(scene.useItem("acc_1", "it_nope")).rejects.toMatchObject({
      code: "item_not_found",
    });
  });

  it("清水补饮水（上限钳制）", async () => {
    const { scene, state } = boot();
    await scene.useItem("acc_1", "it_water");
    // maxWater = 100 + 15*5 = 175；100 + 30 = 130
    expect(state.characters[0]?.water).toBe(130);
    expect(state.items.find((i) => i.id === "it_water")).toBeUndefined();
  });
});

describe("app 集成（inventory 动作路由）", () => {
  it("equip → unequip → use 全链路", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };

    // 无角色 → 404
    const noChar = await app.inject({
      method: "POST",
      url: "/inventory/equip",
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: "it_sword" },
    });
    expect(noChar.statusCode).toBe(404);

    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      qi: 100,
      jing: 100,
      neili: 0,
      food: 100,
      water: 100,
      eff_qi: 500,
      eff_jing: 500,
      attrs: { str: 25, int: 20, con: 20, dex: 15 },
    });
    state.items.push(
      {
        id: "it_sword",
        character_id: "char_1",
        item_def_id: "iron_sword",
        quantity: 1,
        slot: null,
      },
      {
        id: "it_yao",
        character_id: "char_1",
        item_def_id: "jinchuang_yao",
        quantity: 1,
        slot: null,
      },
    );

    const equip = await app.inject({
      method: "POST",
      url: "/inventory/equip",
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: "it_sword" },
    });
    expect(equip.statusCode).toBe(200);

    const unequip = await app.inject({
      method: "POST",
      url: "/inventory/unequip",
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: "it_sword" },
    });
    expect(unequip.statusCode).toBe(200);

    const use = await app.inject({
      method: "POST",
      url: "/inventory/use",
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: "it_yao" },
    });
    expect(use.statusCode).toBe(200);
    expect((use.json() as { effect: string }).effect).toBe("heal_qi");

    const bad = await app.inject({
      method: "POST",
      url: "/inventory/use",
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: "it_nope" },
    });
    expect(bad.statusCode).toBe(404);
    expect((bad.json() as { error: { code: string } }).error.code).toBe("item_not_found");
  });

  it("SceneError 类型存在（路由映射依赖）", () => {
    expect(SceneError).toBeDefined();
  });
});
