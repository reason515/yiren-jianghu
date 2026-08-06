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
