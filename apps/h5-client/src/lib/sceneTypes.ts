/** 场景数据模型（对齐内容包 schema 的运行时形状；由 GET /scene 组装）。 */

export interface SceneExit {
  dir: string;
  roomId: string;
  name?: string;
}

export interface SceneNpc {
  id: string;
  name: string;
  kind: "battle" | "vendor" | "apprentice_master" | "quest_giver" | "npc";
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

export type SceneActionResult = SceneTalkResult | SceneTradeResult | SceneTakeResult;

export type SceneActionInput =
  | { type: "talk"; targetId: string }
  | { type: "take"; targetId: string }
  | { type: "trade"; targetId: string }
  | { type: "buy"; targetId: string; itemId: string; count: number }
  | { type: "sell"; targetId: string; itemId: string; count: number };
