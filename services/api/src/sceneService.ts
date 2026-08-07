import type { ContentPack, Item, Npc, Room, Skill } from "@yjh/content";
import { computeMaxVitals, maxFoodCapacity, maxWaterCapacity } from "@yjh/game-core";
import type { Db } from "./db.js";

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
  getInventory(accountId: string): Promise<InvItemView[] | null>;
  equip(accountId: string, itemId: string): Promise<{ ok: true }>;
  unequip(accountId: string, itemId: string): Promise<{ ok: true }>;
  useItem(accountId: string, itemId: string): Promise<{ ok: true; effect: string }>;
}

export function createSceneService(db: Db, content: ContentIndex): SceneService {
  const roomView = (room: Room): SceneView => ({
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
      .map((id) => content.items.get(id))
      .filter((it): it is Item => Boolean(it))
      .map((it) => ({ id: it.id, name: it.name, kind: it.kind })),
    actions: room.actions.map((a) => ({ command: a.command, label: a.label })),
  });

  const activeCharacter = async (
    accountId: string,
  ): Promise<{ id: string; room_path: string } | null> => {
    const rows = await db.query<{ id: string; room_path: string }>(
      "SELECT id, room_path FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const roomOf = (characterId: string, roomPath: string): SceneView => {
    const room = content.rooms.get(roomPath);
    if (!room) throw new SceneError("room_not_found", "当前所在房间不存在（内容包版本不一致）");
    return roomView(room);
  };

  return {
    async getScene(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      return roomOf(ch.id, ch.room_path);
    },

    async move(accountId, dir) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SceneError("no_character", "尚未立名闯江湖");
      const room = content.rooms.get(ch.room_path);
      if (!room) throw new SceneError("room_not_found", "当前所在房间不存在（内容包版本不一致）");
      const exit = room.exits.find((e) => e.dir === dir);
      if (!exit) throw new SceneError("invalid_direction", "此路不通");
      await db.query("UPDATE characters SET room_path = $1 WHERE id = $2", [exit.roomId, ch.id]);
      return roomOf(ch.id, exit.roomId);
    },

    async getInventory(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const rows = await db.query<{
        id: string;
        item_def_id: string;
        quantity: number;
        slot: string | null;
      }>("SELECT id, item_def_id, quantity, slot FROM character_items WHERE character_id = $1", [
        ch.id,
      ]);
      return rows.rows.map((r) => {
        const def = content.items.get(r.item_def_id);
        return {
          id: r.id,
          name: def?.name ?? r.item_def_id,
          kind: def?.kind ?? "misc",
          quantity: r.quantity,
          equipped: r.slot != null,
        };
      });
    },

    async equip(accountId, itemId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{
        id: string;
        item_def_id: string;
        slot: string | null;
      }>("SELECT id, item_def_id, slot FROM character_items WHERE id = $1 AND character_id = $2", [
        itemId,
        ch.id,
      ]);
      const row = rows.rows[0];
      if (!row) throw new SceneError("item_not_found", "行囊里没有此物");
      const def = content.items.get(row.item_def_id);
      const slot = def?.kind === "weapon" ? "weapon" : def?.kind === "armor" ? "armor" : null;
      if (!slot) throw new SceneError("cannot_equip", "此物无从佩挂");
      if (row.slot === slot) throw new SceneError("already_equipped", "此物已佩在身上");

      // 同槽位替换：旧装备卸下
      await db.query(
        "UPDATE character_items SET slot = NULL WHERE character_id = $1 AND slot = $2 AND id <> $3",
        [ch.id, slot, itemId],
      );
      await db.query("UPDATE character_items SET slot = $1 WHERE id = $2 AND character_id = $3", [
        slot,
        itemId,
        ch.id,
      ]);
      return { ok: true };
    },

    async unequip(accountId, itemId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{ id: string; slot: string | null }>(
        "SELECT id, slot FROM character_items WHERE id = $1 AND character_id = $2",
        [itemId, ch.id],
      );
      const row = rows.rows[0];
      if (!row) throw new SceneError("item_not_found", "行囊里没有此物");
      if (!row.slot) throw new SceneError("not_equipped", "此物并未佩挂");
      await db.query("UPDATE character_items SET slot = NULL WHERE id = $1 AND character_id = $2", [
        itemId,
        ch.id,
      ]);
      return { ok: true };
    },

    async useItem(accountId, itemId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SceneError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{
        id: string;
        item_def_id: string;
        quantity: number;
      }>(
        "SELECT id, item_def_id, quantity FROM character_items WHERE id = $1 AND character_id = $2",
        [itemId, ch.id],
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
      }>("SELECT id, qi, jing, neili, food, water, attrs FROM characters WHERE id = $1", [ch.id]);
      const c = me.rows[0]!;
      const forceRows = await db.query<{ skill_id: string; level: number }>(
        "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
        [ch.id],
      );
      const forceLevels = forceRows.rows
        .filter((r) => content.skills.get(r.skill_id)?.category === "force")
        .map((r) => r.level);
      const forceLevel = forceLevels.length > 0 ? Math.max(...forceLevels) : 0;
      const attrs = c.attrs ?? { str: 10, int: 10, con: 10, dex: 10 };
      const maxVitals = computeMaxVitals(content.params, {
        str: attrs.str,
        int: attrs.int,
        con: attrs.con,
        dex: attrs.dex,
        forceLevel,
      });
      const maxFood = maxFoodCapacity(content.params, attrs.con);
      const maxWater = maxWaterCapacity(content.params, attrs.dex);

      let { qi, jing, neili, food, water } = c;
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
        [qi, jing, neili, food, water, ch.id],
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
