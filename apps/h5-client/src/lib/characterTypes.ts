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
export type SkillCategory =
  "force" | "dodge" | "parry" | "unarmed" | "sword" | "blade" | "knowledge";
/** 可激发槎位（DC-041）；knowledge 只展示/门槛，不可激发。 */
export type EnableSlot = "force" | "dodge" | "parry" | "unarmed" | "sword" | "blade";
export type ItemKind = "weapon" | "armor" | "drug" | "food" | "misc";

export interface SkillRowView {
  id: string;
  name: string;
  category: SkillCategory;
  /** basic = 槎本身；special = 可挂到 enableSlots（DC-041）。 */
  kind: "basic" | "special";
  /** 特殊功可激发的基本槎；基本功恒为空。 */
  enableSlots: EnableSlot[];
  /** 内容包短述；人物簿展开行内只读展示。 */
  description?: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
}

/** 已解锁招式（DC-041：character_moves，普攻自动抽式）。 */
export interface MoveRowView {
  id: string;
  name: string;
  skillId: string;
}

/** 已学绝招（DC-041：character_performs；DC-052 含场外运功元数据）。 */
export interface PerformRowView {
  id: string;
  name: string;
  skillId: string;
  effectType?: "damage" | "heal" | "heal_jing" | "buff";
  fieldKind?: "heal" | "cure" | "heal_jing" | null;
  cost?: { qi: number; jing: number; neili: number };
}

/** 激发图：槎 → 特殊功 id；null 表示该槎显式回退基本功。 */
export type SkillEnableMap = Partial<Record<EnableSlot, string | null>>;

/** 人物簿「武学」页一站式视图（DC-041：GET /skills/mastery）。 */
export interface MasteryView {
  skills: SkillRowView[];
  skillEnable: SkillEnableMap;
  effective: Partial<Record<EnableSlot, number>>;
  moves: MoveRowView[];
  performs: PerformRowView[];
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
  masterNpcId?: string | null;
  sectId?: string | null;
  generation?: number | null;
  masterName?: string | null;
  /** 激发图（DC-041：缺省槎已按 autoEnableMap 补齐）。 */
  skillEnable?: SkillEnableMap;
  /** 已解锁招式（DC-041）。 */
  moves?: MoveRowView[];
  /** 已学绝招（DC-041）。 */
  performs?: PerformRowView[];
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
  kind?: string;
  enableSlots?: string[];
  description?: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
}

const SKILL_CATEGORIES: SkillCategory[] = [
  "force",
  "dodge",
  "parry",
  "unarmed",
  "sword",
  "blade",
  "knowledge",
];
const ENABLE_SLOTS: EnableSlot[] = ["force", "dodge", "parry", "unarmed", "sword", "blade"];
const ITEM_KINDS: ItemKind[] = ["weapon", "armor", "drug", "food", "misc"];

function asCategory(value: string): SkillCategory {
  return SKILL_CATEGORIES.includes(value as SkillCategory) ? (value as SkillCategory) : "knowledge";
}

function asEnableSlots(values: string[] | undefined): EnableSlot[] {
  return (values ?? []).filter((v): v is EnableSlot => ENABLE_SLOTS.includes(v as EnableSlot));
}

function asSkillKind(value: string | undefined): "basic" | "special" {
  return value === "special" ? "special" : "basic";
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
        kind: asSkillKind(skill.kind),
        enableSlots: asEnableSlots(skill.enableSlots),
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
