/** 场景数据模型（对齐内容包 schema 的运行时形状；由 GET /scene 组装）。 */

export interface SceneExit {
  dir: string;
  roomId: string;
  name?: string;
}

export interface SceneNpc {
  id: string;
  name: string;
  kind: "battle" | "vendor" | "tuition_teacher" | "apprentice_master" | "quest_giver" | "npc";
  /** 门派 id（apprentice_master）。 */
  sectId?: string;
  /** 门派辈分（DC-040）；数字越小越尊。 */
  generation?: number;
  /** 是否收门外之人（入门点）。 */
  acceptOutsiders?: boolean;
}

export interface SceneItem {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "drug" | "food" | "misc";
}

export interface SceneAction {
  command: string;
  label: string;
}

export interface SceneRoom {
  id: string;
  area: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  canSleep: boolean;
  exits: SceneExit[];
  npcs: SceneNpc[];
  items: SceneItem[];
  actions: SceneAction[];
}

export interface SceneTalkResult {
  kind: "talk";
  npc: { id: string; name: string };
  dialogue: string[];
}

export interface SceneTradeResult {
  kind: "trade";
  vendor: { id: string; name: string };
  silver: number;
  goods: Array<{ itemId: string; name: string; kind: string; buy: number; sell: number }>;
  inventory: Array<{
    id: string;
    name: string;
    kind: string;
    quantity: number;
    equipped: boolean;
    sell: number;
  }>;
}

export interface SceneTakeResult {
  kind: "take";
  item: { id: string; name: string; quantity: number };
}

/** V2.12/V2.16 观察结果：NPC 多行仪容 / 物品外观（入见闻展示）。 */
export interface SceneObserveResult {
  kind: "observe";
  targetType: "npc" | "item";
  name: string;
  description: string;
  /** 多行短述（外形 / 武功 / 衣着）；缺省时客户端回退单行 description。 */
  lines?: string[];
}

export type SceneActionResult =
  SceneTalkResult | SceneTradeResult | SceneTakeResult | SceneObserveResult;

export type SceneActionInput =
  | { type: "talk"; targetId: string }
  | { type: "take"; targetId: string }
  | { type: "observe"; targetId: string }
  | { type: "trade"; targetId: string }
  | { type: "buy"; targetId: string; itemId: string; count: number }
  | { type: "sell"; targetId: string; itemId: string; count: number };
