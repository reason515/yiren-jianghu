/** 角色面板数据（由 GET /characters/me 组装；服务端权威）。 */

export interface CharAttrView {
  cur: number;
  base: number;
}

export interface CharAttrs {
  str: CharAttrView;
  int: CharAttrView;
  con: CharAttrView;
  dex: CharAttrView;
}

export type SkillCategory = "force" | "weapon" | "dodge" | "parry" | "knowledge";

export interface SkillRowView {
  id: string;
  name: string;
  category: SkillCategory;
  level: number;
  maxLevel: number;
  /** 是否已装备（内功/兵器/轻功/招架槽）。 */
  equipped: boolean;
}

export interface EquipSlotView {
  slot: "weapon" | "armor";
  item?: { id: string; name: string };
}

export interface InvItemView {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "drug" | "food" | "misc";
  quantity: number;
  equipped?: boolean;
}

export interface CharacterView {
  id: string;
  name: string;
  gender: "male" | "female";
  exp: number;
  /** 有效潜能 = potential − learnedPoints（服务端计算）。 */
  effectivePotential: number;
  silver: number;
  attrs: CharAttrs;
  skills: SkillRowView[];
  equipment: EquipSlotView[];
  inventory: InvItemView[];
}
