import type { ContentPack, Item, Npc, Room } from "@yjh/content";
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
}

export function buildContentIndex(pack: ContentPack): ContentIndex {
  return {
    rooms: new Map(pack.rooms.map((r) => [r.id, r])),
    npcs: new Map(pack.npcs.map((n) => [n.id, n])),
    items: new Map(pack.items.map((i) => [i.id, i])),
  };
}

export interface SceneService {
  getScene(accountId: string): Promise<SceneView | null>;
  move(accountId: string, dir: string): Promise<SceneView>;
  getInventory(accountId: string): Promise<InvItemView[] | null>;
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
  };
}
