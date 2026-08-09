import { describe, expect, it, vi } from "vitest";
import { createSceneService, SceneError, buildContentIndex } from "./sceneService.js";
import { createCharacterService } from "./characterService.js";
import { createApp } from "./app.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

/** 最小内容包 fixture（新手村两房间 + 守卫 + 铁剑）。 */
const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [
    {
      id: "village_start",
      area: "newbie",
      name: "老屋·旧榻",
      shortDesc: "土墙斑驳",
      longDesc: "晨光里浮着微尘。",
      grid: [0, 0],
      exits: [{ dir: "east", roomId: "village_square" }],
      npcIds: [],
      itemIds: [],
      actions: [],
    },
    {
      id: "village_square",
      area: "newbie",
      name: "村口广场",
      shortDesc: "晒谷场上稻香未散",
      longDesc: "青石被日头晒得发白。",
      grid: [1, 0],
      exits: [
        { dir: "west", roomId: "village_start" },
        { dir: "east", roomId: "village_shop" },
      ],
      npcIds: ["village_guard"],
      itemIds: ["iron_sword"],
      actions: [{ command: "q_newbie_trail", label: "请托" }],
    },
    {
      id: "village_shop",
      area: "newbie",
      name: "村口杂货铺",
      shortDesc: "柜台上摆着油盐干粮。",
      longDesc: "掌柜拨着算盘，眼皮也不抬。",
      exits: [{ dir: "west", roomId: "village_square" }],
      npcIds: ["general_shop"],
      itemIds: ["dry_food"],
      actions: [],
    },
  ],
  npcs: [
    {
      id: "village_guard",
      name: "村口守卫",
      kind: "npc",
      description: "粗布劲装，腰挎短刀。",
      skills: [{ skillId: "basic_sword", level: 10 }],
      equipment: ["cubu_yi", "iron_sword"],
      drops: [],
      goods: [],
      aggressive: false,
      dialogue: [],
    },
    {
      id: "general_shop",
      name: "杂货铺掌柜",
      kind: "vendor",
      description: "胖乎乎，笑呵呵，柜台摆满油盐酱醋。",
      skills: [],
      equipment: ["cubu_yi"],
      drops: [],
      goods: [{ itemId: "dry_food", buy: 1, sell: 1 }],
      aggressive: false,
      dialogue: ["要什么，自己瞧。"],
    },
  ],
  items: [
    {
      id: "iron_sword",
      name: "铁剑",
      kind: "weapon",
      value: 20,
      weight: 3,
      stackable: false,
      description: "粗铁长剑。",
    },
    {
      id: "cubu_yi",
      name: "粗布衣",
      kind: "armor",
      value: 5,
      weight: 2,
      stackable: false,
      description: "粗麻织就的短褐。",
    },
    {
      id: "dry_food",
      name: "干粮",
      kind: "food",
      value: 1,
      weight: 1,
      stackable: true,
      description: "硬得能砸核桃的干粮。",
      usable: { effect: "feed", amount: 30 },
    },
  ],
  skills: [],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

/** 内存 mock DB：支持 accounts/sessions/characters room_path / character_items。 */
function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as Array<{
      id: string;
      account_id: string;
      name: string;
      status: string;
      room_path: string;
      silver: number;
      qi?: number;
      jing?: number;
      jingli?: number;
      neili?: number;
      food?: number;
      water?: number;
      attrs?: string;
      last_heal_at?: string | null;
    }>,
    character_items: [] as Array<{
      id: string;
      character_id: string;
      item_def_id: string;
      quantity: number;
      slot: string | null;
    }>,
    character_room_items: [] as Array<{
      character_id: string;
      room_id: string;
      item_def_id: string;
    }>,
    afk_jobs: [] as Array<{
      id: string;
      character_id: string;
      status: string;
      presence: string;
    }>,
    shop_cashflows: new Map<string, number>(),
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
      if (text.includes("SELECT id, qi, jing, jingli, neili, food, water, attrs, last_heal_at")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              qi: c.qi ?? 100,
              jing: c.jing ?? 100,
              jingli: c.jingli ?? 100,
              neili: c.neili ?? 0,
              food: c.food ?? 300,
              water: c.water ?? 300,
              attrs: c.attrs ?? '{"str":20,"int":20,"con":20,"dex":20}',
              last_heal_at:
                c.last_heal_at === undefined ? new Date().toISOString() : c.last_heal_at,
            })) as unknown as T[],
        };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, jingli = $3, neili = $4, food = $5, water = $6",
        )
      ) {
        const character = state.characters.find((c) => c.id === params[6]);
        if (character) {
          character.qi = Number(params[0]);
          character.jing = Number(params[1]);
          character.jingli = Number(params[2]);
          character.neili = Number(params[3]);
          character.food = Number(params[4]);
          character.water = Number(params[5]);
          character.last_heal_at = new Date().toISOString();
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET last_heal_at = now()")) {
        const character = state.characters.find((c) => c.id === params[0]);
        if (character) character.last_heal_at = new Date().toISOString();
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT id, room_path, silver FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id, room_path: c.room_path, silver: c.silver })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, room_path FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id, room_path: c.room_path })) as unknown as T[],
        };
      }
      if (
        text.includes("FROM afk_jobs") &&
        text.includes("status = 'running'") &&
        text.includes("presence = 'online'")
      ) {
        return {
          rows: state.afk_jobs
            .filter(
              (j) =>
                j.character_id === params[0] && j.status === "running" && j.presence === "online",
            )
            .map((j) => ({ id: j.id })) as unknown as T[],
        };
      }
      if (text.includes("SELECT item_def_id FROM character_room_items")) {
        return {
          rows: state.character_room_items
            .filter((item) => item.character_id === params[0] && item.room_id === params[1])
            .map((item) => ({ item_def_id: item.item_def_id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO character_room_items")) {
        const character_id = String(params[0] ?? "");
        const room_id = String(params[1] ?? "");
        const item_def_id = String(params[2] ?? "");
        const exists = state.character_room_items.some(
          (item) =>
            item.character_id === character_id &&
            item.room_id === room_id &&
            item.item_def_id === item_def_id,
        );
        if (exists) return { rows: [] as unknown as T[] };
        state.character_room_items.push({ character_id, room_id, item_def_id });
        return { rows: [{ item_def_id }] as unknown as T[] };
      }
      if (
        text.includes("SELECT id, item_def_id, quantity, slot FROM character_items WHERE id") &&
        text.includes("FOR UPDATE")
      ) {
        return {
          rows: state.character_items
            .filter((item) => item.id === params[0] && item.character_id === params[1])
            .map((item) => ({ ...item })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO character_items")) {
        // 建角赠衣：VALUES ($1, $2, 1, $3) → [charId, defId, slot]
        // 拾取/购买：VALUES ($1, $2, 1|$3) → [charId, defId, qty?]
        const withSlot = text.includes(", slot)");
        state.character_items.push({
          id: `ci_${state.character_items.length + 1}`,
          character_id: String(params[0]),
          item_def_id: String(params[1]),
          quantity: withSlot ? 1 : Number(params[2] ?? 1),
          slot: withSlot ? String(params[2]) : null,
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET silver = silver -")) {
        const character = state.characters.find((item) => item.id === params[1]);
        if (!character || character.silver < Number(params[0]))
          return { rows: [] as unknown as T[] };
        character.silver -= Number(params[0]);
        return { rows: [{ silver: character.silver }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO shop_cashflows")) {
        const key = String(params[0]);
        const received = state.shop_cashflows.get(key) ?? 0;
        const next = received + Number(params[1]);
        if (next > Number(params[2])) return { rows: [] as unknown as T[] };
        state.shop_cashflows.set(key, next);
        return { rows: [{ sell_received: next }] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET silver = silver +")) {
        const character = state.characters.find((item) => item.id === params[1]);
        if (character) character.silver += Number(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE character_items SET quantity = quantity - $1")) {
        const item = state.character_items.find((entry) => entry.id === params[1]);
        if (item) item.quantity -= Number(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("DELETE FROM character_items WHERE id = $1 AND character_id = $2")) {
        const index = state.character_items.findIndex(
          (item) => item.id === params[0] && item.character_id === params[1],
        );
        if (index >= 0) state.character_items.splice(index, 1);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET room_path")) {
        const target = state.characters.find((c) => c.id === params[1]);
        if (target) target.room_path = String(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM characters WHERE account_id") && text.includes("status = 'active'")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO characters")) {
        const id = `char_${state.characters.length + 1}`;
        state.characters.push({
          id,
          account_id: String(params[0]),
          name: String(params[1]),
          status: "active",
          room_path: String(params[4]),
          silver: 10,
        });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("SELECT id, item_def_id, quantity, slot FROM character_items")) {
        return {
          rows: state.character_items
            .filter((i) => i.character_id === params[0])
            .map((i) => ({
              id: i.id,
              item_def_id: i.item_def_id,
              quantity: i.quantity,
              slot: i.slot,
            })) as unknown as T[],
        };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  db.transaction = async <T>(work: (tx: Db) => Promise<T>): Promise<T> => work(db);
  return { db, state };
}

const INPUT = {
  name: "陆小风",
  gender: "male" as const,
  attrs: { str: 25, int: 20, con: 20, dex: 15 },
};

async function boot(quests?: {
  recordProgress: (accountId: string, type: "goto", targetId: string) => Promise<null>;
}) {
  const { db, state } = mockDb();
  const chars = createCharacterService(db);
  const { characterId } = await chars.createCharacter("acc_1", INPUT);
  state.character_items.push({
    id: `ci_${state.character_items.length + 1}`,
    character_id: characterId,
    item_def_id: "iron_sword",
    quantity: 1,
    slot: null,
  });
  const scene = createSceneService(db, buildContentIndex(PACK), quests);
  return { db, state, scene, characterId };
}

describe("sceneService.getScene", () => {
  it("组装房间：出口/NPC/物品/动作；无角色返回 null", async () => {
    const { scene, db } = await boot();
    const view = await scene.getScene("acc_1");
    expect(view).toMatchObject({ id: "village_start", name: "老屋·旧榻" });
    expect(view?.exits).toEqual([{ dir: "east", roomId: "village_square" }]);
    expect(await scene.getScene("acc_x")).toBeNull();
    void db;
  });

  it("到达广场房间时包含 NPC/物品/动作", async () => {
    const { scene } = await boot();
    await scene.move("acc_1", "east");
    const view = await scene.getScene("acc_1");
    expect(view?.npcs).toEqual([
      { id: "village_guard", name: "村口守卫", kind: "npc", skills: [] },
    ]);
    expect(view?.items).toEqual([{ id: "iron_sword", name: "铁剑", kind: "weapon" }]);
    expect(view?.actions).toEqual([{ command: "q_newbie_trail", label: "请托" }]);
  });
});

describe("sceneService.getMap", () => {
  it("返回当前区域房间、去重无向边、当前所在标记与天下图", async () => {
    const { scene } = await boot();
    const map = await scene.getMap("acc_1");
    expect(map.areaId).toBe("newbie");
    expect(map.rooms.length).toBeGreaterThan(0);
    expect(map.rooms.every((r) => r.id.startsWith("village_"))).toBe(true);
    expect(map.rooms.find((r) => r.state === "current")?.id).toBe("village_start");
    expect(map.rooms.every((r) => r.grid.length === 2)).toBe(true);
    // 双向出口只出一条无向边
    const pairs = map.edges.filter(
      (e) =>
        (e.from === "village_start" && e.to === "village_square") ||
        (e.from === "village_square" && e.to === "village_start"),
    );
    expect(pairs).toHaveLength(1);
    expect(map.world.nodes.some((n) => n.id === "newbie" && n.state === "current")).toBe(true);
    await expect(scene.getMap("acc_x")).rejects.toMatchObject({ code: "no_character" });
  });

  it("移动后 current 跟随角色位置", async () => {
    const { scene } = await boot();
    await scene.move("acc_1", "east");
    const map = await scene.getMap("acc_1");
    expect(map.rooms.find((r) => r.state === "current")?.id).toBe("village_square");
  });
});

describe("sceneService.move", () => {
  it("移动更新 room_path 并返回新场景；无效方向拒绝", async () => {
    const { scene, state } = await boot();
    const view = await scene.move("acc_1", "east");
    expect(view?.id).toBe("village_square");
    expect(state.characters[0]?.room_path).toBe("village_square");
    await expect(scene.move("acc_1", "south")).rejects.toMatchObject({ code: "invalid_direction" });
    expect(state.characters[0]?.room_path).toBe("village_square");
  });

  it("在线挂机 running 时拒绝移动（afk_busy）", async () => {
    const { scene, state } = await boot();
    state.afk_jobs.push({
      id: "job_1",
      character_id: "char_1",
      status: "running",
      presence: "online",
    });
    await expect(scene.move("acc_1", "east")).rejects.toMatchObject({ code: "afk_busy" });
    expect(state.characters[0]?.room_path).toBe("village_start");
  });

  it("抵达房间时由服务端推进 goto 相位", async () => {
    const recordProgress = vi.fn().mockResolvedValue(null);
    const { scene } = await boot({ recordProgress });
    await scene.move("acc_1", "east");
    expect(recordProgress).toHaveBeenCalledWith("acc_1", "goto", "village_square");
  });

  it("无角色移动 → no_character", async () => {
    const { scene } = await boot();
    await expect(scene.move("acc_x", "east")).rejects.toBeInstanceOf(SceneError);
  });
});

describe("sceneService.act", () => {
  it("交谈只允许当前房间 NPC，返回内容包对话", async () => {
    const { scene } = await boot();
    await scene.move("acc_1", "east");
    await scene.move("acc_1", "east");

    await expect(
      scene.act("acc_1", { type: "talk", targetId: "village_guard" }),
    ).rejects.toMatchObject({
      code: "npc_not_here",
    });
    await expect(scene.act("acc_1", { type: "talk", targetId: "general_shop" })).resolves.toEqual({
      kind: "talk",
      npc: { id: "general_shop", name: "杂货铺掌柜" },
      dialogue: ["要什么，自己瞧。"],
    });
  });

  it("观察返回 NPC 外形/武功/衣着多行与物品外观（V2.16）", async () => {
    const { scene } = await boot();
    await scene.move("acc_1", "east");
    await expect(
      scene.act("acc_1", { type: "observe", targetId: "village_guard" }),
    ).resolves.toEqual({
      kind: "observe",
      targetType: "npc",
      name: "村口守卫",
      description: [
        "粗布劲装，腰挎短刀。",
        "武功初窥门径，招式仍显生疏。",
        "身上穿着粗布衣。",
        "腰间悬着铁剑。",
      ].join("\n"),
      lines: [
        "粗布劲装，腰挎短刀。",
        "武功初窥门径，招式仍显生疏。",
        "身上穿着粗布衣。",
        "腰间悬着铁剑。",
      ],
      skills: [],
    });
    await scene.move("acc_1", "east");
    await expect(
      scene.act("acc_1", { type: "observe", targetId: "general_shop" }),
    ).resolves.toEqual({
      kind: "observe",
      targetType: "npc",
      name: "杂货铺掌柜",
      description: [
        "胖乎乎，笑呵呵，柜台摆满油盐酱醋。",
        "气息寻常，看不出深浅。",
        "身上穿着粗布衣。",
      ].join("\n"),
      lines: ["胖乎乎，笑呵呵，柜台摆满油盐酱醋。", "气息寻常，看不出深浅。", "身上穿着粗布衣。"],
      skills: [],
    });
    await expect(scene.act("acc_1", { type: "observe", targetId: "dry_food" })).resolves.toEqual({
      kind: "observe",
      targetType: "item",
      name: "干粮",
      description: "硬得能砸核桃的干粮。",
      lines: ["硬得能砸核桃的干粮。"],
    });
    await expect(scene.act("acc_1", { type: "observe", targetId: "nope" })).rejects.toMatchObject({
      code: "target_not_here",
    });
  });

  it("自然恢复：距上次结算 10 分钟后交互，qi/jing 按比例回升、食水下降（V2.12/DC-044）", async () => {
    const { scene, state } = await boot();
    const character = state.characters[0]!;
    character.qi = 0;
    character.jing = 0;
    character.food = 300;
    character.water = 300;
    character.attrs = '{"str":20,"int":20,"con":20,"dex":20}';
    character.last_heal_at = new Date(Date.now() - 10 * 60000).toISOString();
    await scene.getScene("acc_1");
    // maxQi=420：floor(420*0.02*10)=84；maxJing=420：floor(420*0.015*10)=63
    expect(character.qi).toBe(84);
    expect(character.jing).toBe(63);
    expect(character.food).toBe(290);
    expect(character.water).toBe(285);
  });

  it("自然恢复：last_heal_at 为空时只初始化时钟，不永久跳过", async () => {
    const { scene, state } = await boot();
    const character = state.characters[0]!;
    character.qi = 0;
    character.last_heal_at = null;
    await scene.getScene("acc_1");
    expect(character.qi).toBe(0);
    expect(character.last_heal_at).toBeTruthy();
  });

  it("拾取按角色一次性落入行囊，并从该角色的场景中移除", async () => {
    const { scene, state } = await boot();
    await scene.move("acc_1", "east");
    await scene.move("acc_1", "east");

    await expect(scene.act("acc_1", { type: "take", targetId: "dry_food" })).resolves.toMatchObject(
      {
        kind: "take",
        item: { id: "dry_food", quantity: 1 },
      },
    );
    expect(state.character_items.some((item) => item.item_def_id === "dry_food")).toBe(true);
    expect((await scene.getScene("acc_1"))?.items).toEqual([]);
    await expect(scene.act("acc_1", { type: "take", targetId: "dry_food" })).rejects.toMatchObject({
      code: "item_already_taken",
    });
  });

  it("商贩以内容包报价交易：扣银两、入行囊，并可按回收价卖出", async () => {
    const { scene, state } = await boot();
    await scene.move("acc_1", "east");
    await scene.move("acc_1", "east");

    const opened = await scene.act("acc_1", { type: "trade", targetId: "general_shop" });
    expect(opened).toMatchObject({
      kind: "trade",
      silver: 10,
      goods: [{ itemId: "dry_food", buy: 1 }],
    });

    const bought = await scene.act("acc_1", {
      type: "buy",
      targetId: "general_shop",
      itemId: "dry_food",
      count: 2,
    });
    expect(bought).toMatchObject({ kind: "trade", silver: 8 });
    const boughtItem = state.character_items.find((item) => item.item_def_id === "dry_food")!;
    expect(boughtItem.quantity).toBe(2);

    const sold = await scene.act("acc_1", {
      type: "sell",
      targetId: "general_shop",
      itemId: boughtItem.id,
      count: 1,
    });
    expect(sold).toMatchObject({ kind: "trade", silver: 9 });
    expect(boughtItem.quantity).toBe(1);
  });
});

describe("sceneService.getInventory", () => {
  it("返回行囊（def 名回填 + 未装备标记）；无角色 null", async () => {
    const { scene } = await boot();
    const inv = await scene.getInventory("acc_1");
    expect(inv).toEqual([
      { id: "ci_1", name: "粗布衣", kind: "armor", quantity: 1, equipped: true },
      { id: "ci_2", name: "铁剑", kind: "weapon", quantity: 1, equipped: false },
    ]);
    expect(await scene.getInventory("acc_x")).toBeNull();
  });
});

describe("app 集成（scene/inventory 路由）", () => {
  it("GET /scene 与 POST /scene/action(move) 与 GET /inventory 全链路", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    // 登录 + 创建角色
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };
    const create = await app.inject({
      method: "POST",
      url: "/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "陆小风", gender: "male", attrs: { str: 25, int: 20, con: 20, dex: 15 } },
    });
    const { characterId } = create.json() as { characterId: string };
    state.character_items.push({
      id: "ci_2",
      character_id: characterId,
      item_def_id: "iron_sword",
      quantity: 1,
      slot: null,
    });

    const sceneRes = await app.inject({
      method: "GET",
      url: "/scene",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sceneRes.statusCode).toBe(200);
    expect(sceneRes.json()).toMatchObject({ id: "village_start" });

    const moveRes = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "move", dir: "east" },
    });
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toMatchObject({ id: "village_square" });

    const badMove = await app.inject({
      method: "POST",
      url: "/scene/action",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "move", dir: "south" },
    });
    expect(badMove.statusCode).toBe(400);
    expect(badMove.json()).toMatchObject({ error: { code: "invalid_direction" } });

    const inv = await app.inject({
      method: "GET",
      url: "/inventory",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(inv.json()).toEqual([
      { id: "ci_1", name: "粗布衣", kind: "armor", quantity: 1, equipped: true },
      { id: "ci_2", name: "铁剑", kind: "weapon", quantity: 1, equipped: false },
    ]);

    const map = await app.inject({
      method: "GET",
      url: "/map",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(map.statusCode).toBe(200);
    expect(map.json()).toMatchObject({ rooms: expect.any(Array), edges: expect.any(Array) });
    expect(
      (map.json() as { rooms: Array<{ id: string; state: string }> }).rooms.some(
        (r) => r.id === "village_square" && r.state === "current",
      ),
    ).toBe(true);

    await app.close();
  });
});
