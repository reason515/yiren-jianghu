import type { ContentPack, Item, Npc, Room, Skill } from "@yjh/content";
import { computeMaxVitals, maxFoodCapacity, maxWaterCapacity } from "@yjh/game-core";
import type { Db } from "./db.js";
import type { QuestsService } from "./questsService.js";

/** 场景/行囊域错误。 */
export class SceneError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SceneError";
  }
}

export interface SceneExitView {
  dir: string;
  roomId: string;
  name?: string;
}

export interface SceneNpcView {
  id: string;
  name: string;
  kind: string;
}

export interface SceneItemView {
  id: string;
  name: string;
  kind: string;
}

export interface SceneView {
  id: string;
  area: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  canSleep: boolean;
  exits: SceneExitView[];
  npcs: SceneNpcView[];
  items: SceneItemView[];
  actions: { command: string; label: string }[];
}

export interface InvItemView {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  equipped: boolean;
}

export interface TalkView {
  kind: "talk";
  npc: { id: string; name: string };
  dialogue: string[];
}

export interface TradeView {
  kind: "trade";
  vendor: { id: string; name: string };
  silver: number;
  goods: Array<{ itemId: string; name: string; kind: string; buy: number; sell: number }>;
  inventory: Array<InvItemView & { sell: number }>;
}

export interface TakeView {
  kind: "take";
  item: { id: string; name: string; quantity: number };
}

export type SceneActionInput =
  | { type: "talk"; targetId: string }
  | { type: "take"; targetId: string }
  | { type: "trade"; targetId: string }
  | { type: "buy"; targetId: string; itemId: string; count: number }
  | { type: "sell"; targetId: string; itemId: string; count: number };

export type SceneActionView = TalkView | TradeView | TakeView;

export interface ContentIndex {
  rooms: Map<string, Room>;
  npcs: Map<string, Npc>;
  items: Map<string, Item>;
  skills: Map<string, Skill>;
  params: ContentPack["params"];
}

export function buildContentIndex(pack: ContentPack): ContentIndex {
  return {
    rooms: new Map(pack.rooms.map((r) => [r.id, r])),
    npcs: new Map(pack.npcs.map((n) => [n.id, n])),
    items: new Map(pack.items.map((i) => [i.id, i])),
    skills: new Map(pack.skills.map((s) => [s.id, s])),
    params: pack.params,
  };
}

export interface SceneService {
  getScene(accountId: string): Promise<SceneView | null>;
  move(accountId: string, dir: string): Promise<SceneView>;
  act(accountId: string, input: SceneActionInput): Promise<SceneActionView>;
  getInventory(accountId: string): Promise<InvItemView[] | null>;
  equip(accountId: string, itemId: string): Promise<{ ok: true }>;
  unequip(accountId: string, itemId: string): Promise<{ ok: true }>;
  useItem(accountId: string, itemId: string): Promise<{ ok: true; effect: string }>;
  getMap(accountId: string): Promise<MapView>;
}

/** 区域舆图节点（内容包 rooms.grid + exits 驱动；current 由角色位置决定）。 */
export interface MapRoomView {
  id: string;
  name: string;
  grid: [number, number];
  state: "current" | "visited" | "locked";
}

export interface MapEdgeView {
  from: string;
  to: string;
}

export interface MapView {
  rooms: MapRoomView[];
  edges: MapEdgeView[];
}

type CharacterLocation = { id: string; room_path: string };
type CharacterWithSilver = CharacterLocation & { silver: number | string };
type InventoryRow = { id: string; item_def_id: string; quantity: number; slot: string | null };

const toNumber = (value: number | string): number => Number(value);

export function createSceneService(
  db: Db,
  content: ContentIndex,
  quests?: Pick<QuestsService, "recordProgress">,
): SceneService {
  const activeCharacter = async (
    database: Db,
    accountId: string,
  ): Promise<CharacterLocation | null> => {
    const rows = await database.query<CharacterLocation>(
      "SELECT id, room_path FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const activeCharacterWithSilver = async (
    database: Db,
    accountId: string,
  ): Promise<CharacterWithSilver | null> => {
    const rows = await database.query<CharacterWithSilver>(
      "SELECT id, room_path, silver FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const roomFor = (roomPath: string): Room => {
    const room = content.rooms.get(roomPath);
    if (!room) throw new SceneError("room_not_found", "当前所在房间不存在（内容包版本不一致）");
    return room;
  };

  const roomView = async (database: Db, characterId: string, room: Room): Promise<SceneView> => {
    const takenRows = await database.query<{ item_def_id: string }>(
      "SELECT item_def_id FROM character_room_items WHERE character_id = $1 AND room_id = $2",
      [characterId, room.id],
    );
    const taken = new Set(takenRows.rows.map((row) => row.item_def_id));
    return {
      id: room.id,
      area: room.area,
      name: room.name,
      shortDesc: room.shortDesc,
      longDesc: room.longDesc,
      canSleep: room.canSleep ?? false,
      exits: room.exits.map((e) => ({ dir: e.dir, roomId: e.roomId, name: e.name })),
      npcs: room.npcIds
        .map((id) => content.npcs.get(id))
        .filter((n): n is Npc => Boolean(n))
        .map((n) => ({ id: n.id, name: n.name, kind: n.kind })),
      items: room.itemIds
        .filter((id) => !taken.has(id))
        .map((id) => content.items.get(id))
        .filter((it): it is Item => Boolean(it))
        .map((it) => ({ id: it.id, name: it.name, kind: it.kind })),
      actions: room.actions.map((a) => ({ command: a.command, label: a.label })),
    };
  };

  const inventoryRowsFor = async (database: Db, characterId: string): Promise<InventoryRow[]> => {
    const rows = await database.query<InventoryRow>(
      "SELECT id, item_def_id, quantity, slot FROM character_items WHERE character_id = $1",
      [characterId],
    );
    return rows.rows;
  };

  const inventoryFor = async (database: Db, characterId: string): Promise<InvItemView[]> => {
    const rows = await inventoryRowsFor(database, characterId);
    return rows.map((row) => {
      const def = content.items.get(row.item_def_id);
      return {
        id: row.id,
        name: def?.name ?? row.item_def_id,
        kind: def?.kind ?? "misc",
        quantity: row.quantity,
        equipped: row.slot != null,
      };
    });
  };

  const npcInRoom = (room: Room, targetId: string): Npc => {
    if (!room.npcIds.includes(targetId)) {
      throw new SceneError("npc_not_here", "此人不在眼前");
    }
    const npc = content.npcs.get(targetId);
    if (!npc) throw new SceneError("npc_not_found", "此人已不知去向");
    return npc;
  };

  const vendorInRoom = (room: Room, targetId: string): Npc => {
    const npc = npcInRoom(room, targetId);
    if (npc.kind !== "vendor") throw new SceneError("not_a_vendor", "此人不做买卖");
    return npc;
  };

  const tradeView = async (
    database: Db,
    accountId: string,
    vendorId: string,
  ): Promise<TradeView> => {
    const character = await activeCharacterWithSilver(database, accountId);
    if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
    const vendor = vendorInRoom(roomFor(character.room_path), vendorId);
    const prices = new Map(vendor.goods.map((good) => [good.itemId, good]));
    const inventoryRows = await inventoryRowsFor(database, character.id);
    return {
      kind: "trade",
      vendor: { id: vendor.id, name: vendor.name },
      silver: toNumber(character.silver),
      goods: vendor.goods.flatMap((good) => {
        const item = content.items.get(good.itemId);
        return item
          ? [{ itemId: item.id, name: item.name, kind: item.kind, buy: good.buy, sell: good.sell }]
          : [];
      }),
      inventory: inventoryRows.map((row) => {
        const item = content.items.get(row.item_def_id);
        return {
          id: row.id,
          name: item?.name ?? row.item_def_id,
          kind: item?.kind ?? "misc",
          quantity: row.quantity,
          equipped: row.slot != null,
          sell: prices.get(row.item_def_id)?.sell ?? 0,
        };
      }),
    };
  };

  const validCount = (count: number): number => {
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw new SceneError("invalid_count", "数目须在一至九十九之间");
    }
    return count;
  };

  const withTransaction = async <T>(work: (tx: Db) => Promise<T>): Promise<T> =>
    db.transaction ? db.transaction(work) : work(db);

  return {
    async getScene(accountId) {
      const character = await activeCharacter(db, accountId);
      if (!character) return null;
      return roomView(db, character.id, roomFor(character.room_path));
    },

    async getMap(accountId) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const rooms: MapRoomView[] = [];
      const seenEdges = new Set<string>();
      const edges: MapEdgeView[] = [];
      for (const room of content.rooms.values()) {
        if (!room.grid) continue; // 无网格坐标的房间不入舆图
        rooms.push({
          id: room.id,
          name: room.name,
          grid: room.grid,
          state: room.id === character.room_path ? "current" : "visited",
        });
        for (const exit of room.exits) {
          const key = [room.id, exit.roomId].sort().join("|");
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          edges.push({ from: room.id, to: exit.roomId });
        }
      }
      return { rooms, edges };
    },

    async move(accountId, dir) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const room = roomFor(character.room_path);
      const exit = room.exits.find((candidate) => candidate.dir === dir);
      if (!exit) throw new SceneError("invalid_direction", "此路不通");
      await db.query("UPDATE characters SET room_path = $1 WHERE id = $2", [
        exit.roomId,
        character.id,
      ]);
      // 抵达由服务端驱动任务 goto 相位，客户端只负责发出结构化移动意图。
      await quests?.recordProgress(accountId, "goto", exit.roomId);
      return roomView(db, character.id, roomFor(exit.roomId));
    },

    async act(accountId, input) {
      if (input.type === "talk") {
        const character = await activeCharacter(db, accountId);
        if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
        const npc = npcInRoom(roomFor(character.room_path), input.targetId);
        await quests?.recordProgress(accountId, "talk", npc.id);
        return { kind: "talk", npc: { id: npc.id, name: npc.name }, dialogue: npc.dialogue };
      }

      if (input.type === "take") {
        return withTransaction(async (tx) => {
          const character = await activeCharacter(tx, accountId);
          if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
          const room = roomFor(character.room_path);
          if (!room.itemIds.includes(input.targetId)) {
            throw new SceneError("item_not_here", "此物不在眼前");
          }
          const item = content.items.get(input.targetId);
          if (!item) throw new SceneError("item_not_found", "此物已不知去向");
          const claimed = await tx.query<{ item_def_id: string }>(
            "INSERT INTO character_room_items (character_id, room_id, item_def_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING item_def_id",
            [character.id, room.id, item.id],
          );
          if (!claimed.rows[0]) throw new SceneError("item_already_taken", "此物已收入囊中");
          await tx.query(
            "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, 1)",
            [character.id, item.id],
          );
          return { kind: "take", item: { id: item.id, name: item.name, quantity: 1 } };
        });
      }

      if (input.type === "trade") return tradeView(db, accountId, input.targetId);

      if (input.type === "buy") {
        const count = validCount(input.count);
        return withTransaction(async (tx) => {
          const character = await activeCharacterWithSilver(tx, accountId);
          if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
          const vendor = vendorInRoom(roomFor(character.room_path), input.targetId);
          const good = vendor.goods.find((candidate) => candidate.itemId === input.itemId);
          const item = content.items.get(input.itemId);
          if (!good || !item || good.buy <= 0)
            throw new SceneError("not_for_sale", "这铺子不卖此物");
          const cost = good.buy * count;
          const paid = await tx.query<{ silver: number | string }>(
            "UPDATE characters SET silver = silver - $1 WHERE id = $2 AND silver >= $1 RETURNING silver",
            [cost, character.id],
          );
          if (!paid.rows[0]) throw new SceneError("insufficient_silver", "囊中银两不够");
          await tx.query(
            "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, $3)",
            [character.id, item.id, count],
          );
          return tradeView(tx, accountId, vendor.id);
        });
      }

      const count = validCount(input.count);
      return withTransaction(async (tx) => {
        const character = await activeCharacter(tx, accountId);
        if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
        const vendor = vendorInRoom(roomFor(character.room_path), input.targetId);
        const rows = await tx.query<InventoryRow>(
          "SELECT id, item_def_id, quantity, slot FROM character_items WHERE id = $1 AND character_id = $2 FOR UPDATE",
          [input.itemId, character.id],
        );
        const inventoryItem = rows.rows[0];
        if (!inventoryItem) throw new SceneError("item_not_found", "行囊里没有此物");
        if (inventoryItem.slot) throw new SceneError("item_equipped", "先卸下此物，方可出手");
        if (inventoryItem.quantity < count)
          throw new SceneError("insufficient_item", "行囊里的数目不够");
        const good = vendor.goods.find(
          (candidate) => candidate.itemId === inventoryItem.item_def_id,
        );
        if (!good || good.sell <= 0) throw new SceneError("not_buying", "这铺子不收此物");
        const income = good.sell * count;
        const cashflow = await tx.query<{ sell_received: number | string }>(
          "INSERT INTO shop_cashflows (vendor_id, day, sell_received) SELECT $1, CURRENT_DATE, $2 WHERE $2 <= $3 ON CONFLICT (vendor_id, day) DO UPDATE SET sell_received = shop_cashflows.sell_received + EXCLUDED.sell_received WHERE shop_cashflows.sell_received + EXCLUDED.sell_received <= $3 RETURNING sell_received",
          [vendor.id, income, content.params.economy.maxCashflowPerDay],
        );
        if (!cashflow.rows[0]) {
          throw new SceneError("cashflow_cap", "掌柜今日收货已满，明日再来");
        }
        await tx.query("UPDATE characters SET silver = silver + $1 WHERE id = $2", [
          income,
          character.id,
        ]);
        if (inventoryItem.quantity === count) {
          await tx.query("DELETE FROM character_items WHERE id = $1 AND character_id = $2", [
            inventoryItem.id,
            character.id,
          ]);
        } else {
          await tx.query("UPDATE character_items SET quantity = quantity - $1 WHERE id = $2", [
            count,
            inventoryItem.id,
          ]);
        }
        return tradeView(tx, accountId, vendor.id);
      });
    },

    async getInventory(accountId) {
      const character = await activeCharacter(db, accountId);
      if (!character) return null;
      return inventoryFor(db, character.id);
    },

    async equip(accountId, itemId) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{ id: string; item_def_id: string; slot: string | null }>(
        "SELECT id, item_def_id, slot FROM character_items WHERE id = $1 AND character_id = $2",
        [itemId, character.id],
      );
      const row = rows.rows[0];
      if (!row) throw new SceneError("item_not_found", "行囊里没有此物");
      const def = content.items.get(row.item_def_id);
      const slot = def?.kind === "weapon" ? "weapon" : def?.kind === "armor" ? "armor" : null;
      if (!slot) throw new SceneError("cannot_equip", "此物无从佩挂");
      if (row.slot === slot) throw new SceneError("already_equipped", "此物已佩在身上");

      await db.query(
        "UPDATE character_items SET slot = NULL WHERE character_id = $1 AND slot = $2 AND id <> $3",
        [character.id, slot, itemId],
      );
      await db.query("UPDATE character_items SET slot = $1 WHERE id = $2 AND character_id = $3", [
        slot,
        itemId,
        character.id,
      ]);
      return { ok: true };
    },

    async unequip(accountId, itemId) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{ id: string; slot: string | null }>(
        "SELECT id, slot FROM character_items WHERE id = $1 AND character_id = $2",
        [itemId, character.id],
      );
      const row = rows.rows[0];
      if (!row) throw new SceneError("item_not_found", "行囊里没有此物");
      if (!row.slot) throw new SceneError("not_equipped", "此物并未佩挂");
      await db.query("UPDATE character_items SET slot = NULL WHERE id = $1 AND character_id = $2", [
        itemId,
        character.id,
      ]);
      return { ok: true };
    },

    async useItem(accountId, itemId) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{ id: string; item_def_id: string; quantity: number }>(
        "SELECT id, item_def_id, quantity FROM character_items WHERE id = $1 AND character_id = $2",
        [itemId, character.id],
      );
      const row = rows.rows[0];
      if (!row) throw new SceneError("item_not_found", "行囊里没有此物");
      const def = content.items.get(row.item_def_id);
      const usable = def?.usable;
      if (!usable) throw new SceneError("cannot_use", "此物无法使用");

      const me = await db.query<{
        id: string;
        qi: number;
        jing: number;
        neili: number;
        food: number;
        water: number;
        attrs: { str: number; int: number; con: number; dex: number };
      }>("SELECT id, qi, jing, neili, food, water, attrs FROM characters WHERE id = $1", [
        character.id,
      ]);
      const current = me.rows[0]!;
      const forceRows = await db.query<{ skill_id: string; level: number }>(
        "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
        [character.id],
      );
      const forceLevels = forceRows.rows
        .filter((skill) => content.skills.get(skill.skill_id)?.category === "force")
        .map((skill) => skill.level);
      const forceLevel = forceLevels.length > 0 ? Math.max(...forceLevels) : 0;
      const attrs = current.attrs ?? { str: 10, int: 10, con: 10, dex: 10 };
      const maxVitals = computeMaxVitals(content.params, {
        str: attrs.str,
        int: attrs.int,
        con: attrs.con,
        dex: attrs.dex,
        forceLevel,
      });
      const maxFood = maxFoodCapacity(content.params, attrs.con);
      const maxWater = maxWaterCapacity(content.params, attrs.dex);

      let { qi, jing, neili, food, water } = current;
      const amount = usable.amount;
      switch (usable.effect) {
        case "heal_qi":
          qi = Math.min(maxVitals.maxQi, qi + amount);
          break;
        case "heal_jing":
          jing = Math.min(maxVitals.maxJing, jing + amount);
          break;
        case "restore_neili":
          neili = Math.min(maxVitals.maxNeili, neili + amount);
          break;
        case "feed":
          food = Math.min(maxFood, food + amount);
          break;
        case "quench":
          water = Math.min(maxWater, water + amount);
          break;
      }
      await db.query(
        "UPDATE characters SET qi = $1, jing = $2, neili = $3, food = $4, water = $5 WHERE id = $6",
        [qi, jing, neili, food, water, character.id],
      );
      if (row.quantity > 1) {
        await db.query("UPDATE character_items SET quantity = quantity - 1 WHERE id = $1", [
          itemId,
        ]);
      } else {
        await db.query("DELETE FROM character_items WHERE id = $1", [itemId]);
      }
      return { ok: true, effect: usable.effect };
    },
  };
}
