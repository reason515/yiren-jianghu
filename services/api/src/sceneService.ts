import type { ContentPack, Item, Npc, Room, Rumor, Skill } from "@yjh/content";
import { buildNpcObserveLines, computeMaxVitals, type ObserveGear } from "@yjh/game-core";
import type { Db } from "./db.js";
import type { QuestsService } from "./questsService.js";
import { settleCharacterVitals, vitalsContentFromIndex } from "./vitalsSettle.js";

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
  sectId?: string;
  generation?: number;
  acceptOutsiders?: boolean;
  /** DC-041：观察/详情用武功列表。 */
  skills?: Array<{ id: string; name: string; level: number }>;
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
  /** 内容包定义的物品说明，供行囊详情展示。 */
  description: string;
  /** 装备提供的可见数值；缺省表示没有数值加成。 */
  stats?: { attack?: number; defense?: number; dodge?: number; parry?: number };
  /** 可使用物品的效果摘要；实际结算仍以服务端为准。 */
  usable?: { effect: "heal_qi" | "heal_jing" | "restore_neili" | "cure_qi"; amount: number };
}

export interface TalkView {
  kind: "talk";
  npc: { id: string; name: string };
  dialogue: string[];
  questReport?: {
    questId: string;
    questName: string;
    rewards: { exp: number; potential: number; silver: number };
  };
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

export interface ObserveView {
  kind: "observe";
  targetType: "npc" | "item";
  name: string;
  /** 兼容单行展示；NPC 为多行拼装后的换行文本。 */
  description: string;
  /** V2.16：观察多行（外形 / 武功 / 衣着），客户端串行入见闻。 */
  lines?: string[];
  /** DC-041：结构化武功列表（供人物簿/EntitySheet 展示，取代只读等级数组）。 */
  skills?: Array<{ id: string; name: string; level: number }>;
  /** 教习类 NPC 的可教清单摘要（DC-039，只读展示；报价另走 /skills/teach-offer）。 */
  teaches?: Array<{ skillId: string; skillName: string; maxLevel: number }>;
}

export type SceneActionInput =
  | { type: "talk"; targetId: string }
  | { type: "take"; targetId: string }
  | { type: "observe"; targetId: string }
  | { type: "trade"; targetId: string }
  | { type: "buy"; targetId: string; itemId: string; count: number }
  | { type: "sell"; targetId: string; itemId: string; count: number }
  | { type: "listen_rumor" };

export interface RumorView {
  kind: "rumor";
  rumor: { id: string; text: string };
}

export type SceneActionView = TalkView | TradeView | TakeView | ObserveView | RumorView;

export interface ContentIndex {
  rooms: Map<string, Room>;
  npcs: Map<string, Npc>;
  items: Map<string, Item>;
  skills: Map<string, Skill>;
  params: ContentPack["params"];
  worldMap?: ContentPack["worldMap"];
  rumors: Rumor[];
}

export function buildContentIndex(pack: ContentPack): ContentIndex {
  return {
    rooms: new Map(pack.rooms.map((r) => [r.id, r])),
    npcs: new Map(pack.npcs.map((n) => [n.id, n])),
    items: new Map(pack.items.map((i) => [i.id, i])),
    skills: new Map(pack.skills.map((s) => [s.id, s])),
    params: pack.params,
    worldMap: pack.worldMap,
    rumors: pack.rumors ?? [],
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
  /** 当前所在区域 id（rooms.area） */
  areaId: string;
  /** 区域显示名（天下图节点名，缺省回退 areaId） */
  areaLabel: string;
  rooms: MapRoomView[];
  edges: MapEdgeView[];
  world: {
    nodes: WorldNodeView[];
    roads: WorldRoadView[];
  };
}

/** 天下图节点（内容包 worldMap；state 由角色所在 area 标记）。 */
export interface WorldNodeView {
  id: string;
  name: string;
  kind: string;
  geo: [number, number];
  scale: string;
  state: "current" | "known";
}

export interface WorldRoadView {
  from: string;
  to: string;
  mode: string;
}

type CharacterLocation = { id: string; room_path: string };
type CharacterWithSilver = CharacterLocation & { silver: number | string };
type InventoryRow = { id: string; item_def_id: string; quantity: number; slot: string | null };

const toNumber = (value: number | string): number => Number(value);

export function createSceneService(
  db: Db,
  content: ContentIndex,
  quests?: Pick<QuestsService, "recordProgress"> & Partial<Pick<QuestsService, "reportQuestAtNpc">>,
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

  /** V2.12 / DC-044：场景入口统一结算恢复与食水消耗。 */
  const regenCharacter = async (database: Db, accountId: string): Promise<void> => {
    await settleCharacterVitals(database, vitalsContentFromIndex(content), accountId);
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
        .map((n) => ({
          id: n.id,
          name: n.name,
          kind: n.kind,
          ...(n.sectId ? { sectId: n.sectId } : {}),
          ...(n.generation != null ? { generation: n.generation } : {}),
          ...(n.recruit?.acceptOutsiders ? { acceptOutsiders: true } : {}),
          skills: n.skills.flatMap((ref) => {
            const def = content.skills.get(ref.skillId);
            return def ? [{ id: ref.skillId, name: def.name, level: ref.level }] : [];
          }),
        })),
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
        description: def?.description ?? "",
        ...(def?.stats ? { stats: def.stats } : {}),
        ...(def?.usable ? { usable: def.usable } : {}),
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
          description: item?.description ?? "",
          ...(item?.stats ? { stats: item.stats } : {}),
          ...(item?.usable ? { usable: item.usable } : {}),
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
      await regenCharacter(db, accountId);
      const character = await activeCharacter(db, accountId);
      if (!character) return null;
      return roomView(db, character.id, roomFor(character.room_path));
    },

    async getMap(accountId) {
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const here = roomFor(character.room_path);
      const areaId = here.area;
      const areaLabel = content.worldMap?.nodes.find((node) => node.id === areaId)?.name ?? areaId;

      // 本域舆图：只渲染当前 area 的房间（各域 grid 独立，跨域叠加会重叠）
      const rooms: MapRoomView[] = [];
      const areaRoomIds = new Set<string>();
      for (const room of content.rooms.values()) {
        if (room.area !== areaId || !room.grid) continue;
        areaRoomIds.add(room.id);
        rooms.push({
          id: room.id,
          name: room.name,
          grid: room.grid,
          state: room.id === character.room_path ? "current" : "visited",
        });
      }
      const seenEdges = new Set<string>();
      const edges: MapEdgeView[] = [];
      for (const room of content.rooms.values()) {
        if (!areaRoomIds.has(room.id)) continue;
        for (const exit of room.exits) {
          if (!areaRoomIds.has(exit.roomId)) continue;
          const key = [room.id, exit.roomId].sort().join("|");
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          edges.push({ from: room.id, to: exit.roomId });
        }
      }

      const worldNodes: WorldNodeView[] = (content.worldMap?.nodes ?? []).map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        geo: node.geo,
        scale: node.scale,
        state: node.id === areaId ? "current" : "known",
      }));
      // 无天下图内容时，用本包出现过的 area 兜底成单点，避免前端空态崩溃。
      if (worldNodes.length === 0) {
        const areas = new Set([...content.rooms.values()].map((r) => r.area));
        let i = 0;
        for (const area of areas) {
          worldNodes.push({
            id: area,
            name: area === areaId ? areaLabel : area,
            kind: "landmark",
            geo: [i * 80, 0],
            scale: "village",
            state: area === areaId ? "current" : "known",
          });
          i += 1;
        }
      }
      const worldRoads: WorldRoadView[] = (content.worldMap?.roads ?? []).map((road) => ({
        from: road.from,
        to: road.to,
        mode: road.mode,
      }));

      return {
        areaId,
        areaLabel,
        rooms,
        edges,
        world: { nodes: worldNodes, roads: worldRoads },
      };
    },

    async move(accountId, dir) {
      await regenCharacter(db, accountId);
      const character = await activeCharacter(db, accountId);
      if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
      const busy = await db.query<{ id: string }>(
        `SELECT id FROM afk_jobs
         WHERE character_id = $1 AND status = 'running' AND presence = 'online'
         LIMIT 1`,
        [character.id],
      );
      if (busy.rows[0]) {
        throw new SceneError("afk_busy", "挂机未歇，不便擅离");
      }
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
      await regenCharacter(db, accountId);
      if (input.type === "listen_rumor") {
        const character = await activeCharacter(db, accountId);
        if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
        const room = roomFor(character.room_path);
        if (!room.actions.some((a) => a.command === "listen_rumor")) {
          throw new SceneError("no_rumor", "此处无人闲谈");
        }
        const pool = content.rumors;
        if (pool.length === 0) throw new SceneError("no_rumor", "江湖一时无声");
        const total = pool.reduce((sum, r) => sum + (r.weight ?? 1), 0);
        let roll = Math.random() * total;
        let picked = pool[0]!;
        for (const rumor of pool) {
          roll -= rumor.weight ?? 1;
          if (roll <= 0) {
            picked = rumor;
            break;
          }
        }
        return { kind: "rumor", rumor: { id: picked.id, text: picked.text } };
      }
      if (input.type === "talk") {
        const character = await activeCharacter(db, accountId);
        if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
        const npc = npcInRoom(roomFor(character.room_path), input.targetId);
        await quests?.recordProgress(accountId, "talk", npc.id);
        const report = await quests?.reportQuestAtNpc?.(accountId, npc.id);
        return {
          kind: "talk",
          npc: { id: npc.id, name: npc.name },
          dialogue: npc.dialogue,
          ...(report
            ? {
                questReport: {
                  questId: report.questId,
                  questName: report.questName,
                  rewards: report.rewards,
                },
              }
            : {}),
        };
      }

      // V2.12/V2.16 观察：NPC 外形+武功+衣着 / 物品外观入见闻（只读，不改状态）。
      if (input.type === "observe") {
        const character = await activeCharacter(db, accountId);
        if (!character) throw new SceneError("no_character", "尚未立名闯江湖");
        const room = roomFor(character.room_path);
        const npc = room.npcIds.includes(input.targetId)
          ? content.npcs.get(input.targetId)
          : undefined;
        if (npc) {
          const gear: ObserveGear[] = [];
          for (const itemId of npc.equipment) {
            const item = content.items.get(itemId);
            if (!item) continue;
            if (item.kind === "weapon" || item.kind === "armor") {
              gear.push({ kind: item.kind, name: item.name });
            }
          }
          const lines = buildNpcObserveLines({
            description: npc.description,
            kind: npc.kind,
            skillLevels: npc.skills.map((s) => s.level),
            gear,
          });
          // DC-041：结构化武功列表（供 EntitySheet 展示），与教习摘要（不含报价，报价走 /skills/teach-offer）。
          const skillsView = npc.skills.flatMap((ref) => {
            const def = content.skills.get(ref.skillId);
            return def ? [{ id: ref.skillId, name: def.name, level: ref.level }] : [];
          });
          const teachesView =
            npc.kind === "tuition_teacher" || npc.kind === "apprentice_master"
              ? npc.teaches.flatMap((teach) => {
                  const def = content.skills.get(teach.skillId);
                  return def
                    ? [{ skillId: teach.skillId, skillName: def.name, maxLevel: teach.maxLevel }]
                    : [];
                })
              : undefined;
          return {
            kind: "observe",
            targetType: "npc",
            name: npc.name,
            description: lines.join("\n"),
            lines,
            skills: skillsView,
            ...(teachesView ? { teaches: teachesView } : {}),
          };
        }
        if (room.itemIds.includes(input.targetId)) {
          const item = content.items.get(input.targetId);
          if (item) {
            const description =
              item.description || "看久了，也看不出什么特别之处，只是件寻常物什。";
            return {
              kind: "observe",
              targetType: "item",
              name: item.name,
              description,
              lines: [description],
            };
          }
        }
        throw new SceneError("target_not_here", "眼前没有此物可看");
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
        eff_qi: number;
        eff_jing: number;
        attrs: { str: number; int: number; con: number; dex: number };
      }>("SELECT id, qi, jing, neili, eff_qi, eff_jing, attrs FROM characters WHERE id = $1", [
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
      let { qi, jing, neili } = current;
      let effQi = Math.min(maxVitals.maxQi, Math.max(0, current.eff_qi ?? maxVitals.maxQi));
      const effJing = Math.min(
        maxVitals.maxJing,
        Math.max(0, current.eff_jing ?? maxVitals.maxJing),
      );
      const amount = usable.amount;
      switch (usable.effect) {
        case "heal_qi":
          // DC-048：回气不超过伤势上限
          qi = Math.min(effQi, qi + amount);
          break;
        case "heal_jing":
          jing = Math.min(effJing, jing + amount);
          break;
        case "cure_qi":
          effQi = Math.min(maxVitals.maxQi, effQi + amount);
          qi = Math.min(effQi, qi + Math.floor(amount / 2));
          break;
        case "restore_neili":
          neili = Math.min(maxVitals.maxNeili, neili + amount);
          break;
      }
      await db.query(
        "UPDATE characters SET qi = $1, jing = $2, neili = $3, eff_qi = $4, eff_jing = $5 WHERE id = $6",
        [qi, jing, neili, effQi, effJing, character.id],
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
