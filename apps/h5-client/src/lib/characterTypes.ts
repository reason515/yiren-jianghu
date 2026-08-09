/** 人物簿数据：服务端返回角色/武功/行囊快照，客户端只适配展示与提交意图。 */

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

export type VitalKey = "qi" | "jing" | "jingli" | "neili" | "food" | "water";
export type SkillCategory = "force" | "weapon" | "dodge" | "parry" | "knowledge";
export type ItemKind = "weapon" | "armor" | "drug" | "food" | "misc";

export interface SkillRowView {
  id: string;
  name: string;
  category: SkillCategory;
  /** 内容包短述；人物簿展开行内只读展示。 */
  description?: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
}

export interface EquipSlotView {
  slot: "weapon" | "armor";
  item?: { id: string; name: string };
}

export interface InvItemView {
  id: string;
  name: string;
  kind: ItemKind;
  quantity: number;
  equipped: boolean;
}

export interface CharacterProfile {
  id: string;
  name: string;
  gender: "male" | "female";
  exp: number;
  /** 有效潜能 = potential − learnedPoints（服务端计算）。 */
  effectivePotential: number;
  silver: number;
  attrs: CharAttrs;
  vitals: Record<VitalKey, number>;
  /** 生存资源上限（V2.9：与当前值成对展示）。 */
  vitalsMax: Record<VitalKey, number>;
}

export interface CharacterView extends CharacterProfile {
  skills: SkillRowView[];
  equipment: EquipSlotView[];
  inventory: InvItemView[];
}

interface ApiSkill {
  id: string;
  name: string;
  category: string;
  description?: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
}

const SKILL_CATEGORIES: SkillCategory[] = ["force", "weapon", "dodge", "parry", "knowledge"];
const ITEM_KINDS: ItemKind[] = ["weapon", "armor", "drug", "food", "misc"];

function asCategory(value: string): SkillCategory {
  return SKILL_CATEGORIES.includes(value as SkillCategory) ? (value as SkillCategory) : "knowledge";
}

function asItemKind(value: string): ItemKind {
  return ITEM_KINDS.includes(value as ItemKind) ? (value as ItemKind) : "misc";
}

/** 将三个服务端快照合为人物簿；装备槽由行囊的已佩挂物品派生。 */
export function toCharacterView(
  profile: CharacterProfile,
  skills: ApiSkill[],
  inventory: Array<{ id: string; name: string; kind: string; quantity: number; equipped: boolean }>,
): CharacterView {
  const items = inventory.map((item) => ({ ...item, kind: asItemKind(item.kind) }));
  const slot = (kind: "weapon" | "armor"): EquipSlotView => {
    const item = items.find((candidate) => candidate.kind === kind && candidate.equipped);
    return { slot: kind, ...(item ? { item: { id: item.id, name: item.name } } : {}) };
  };
  return {
    ...profile,
    skills: skills
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        category: asCategory(skill.category),
        ...(skill.description ? { description: skill.description } : {}),
        level: skill.level,
        maxLevel: skill.maxLevel,
        practicePoints: skill.practicePoints,
      }))
      .sort((a, b) => {
        const aLearned = a.level > 0 ? 0 : 1;
        const bLearned = b.level > 0 ? 0 : 1;
        return aLearned - bLearned;
      }),
    equipment: [slot("weapon"), slot("armor")],
    inventory: items,
  };
}
