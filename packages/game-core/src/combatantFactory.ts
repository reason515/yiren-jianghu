import type { ContentPack, Npc } from "@yjh/content";
import { autoEnableMap, type SkillEnableMap, type SkillRaw } from "./enable.js";
import type { Combatant } from "./combat.js";
import { buildCombatant, sumGearStats } from "./combatant.js";

/**
 * 内容包感知的战斗体构造（DC-041/047）：PVE/PVP/行侠挂机共用同一实现。
 */
export interface CharacterCombatSource {
  id: string;
  name: string;
  /** 先天四维。 */
  attrs: { str: number; int: number; con: number; dex: number };
  qi?: number;
  jing?: number;
  neili?: number;
  exp?: number;
  effQi?: number;
  effJing?: number;
  /** 已装备物品实例对应的内容包 item id。 */
  equippedItemIds?: string[];
}

function skillDefsFromPack(content: ContentPack) {
  return new Map(
    content.skills.map((skill) => [
      skill.id,
      {
        kind: skill.kind,
        category: skill.category,
        enableSlots: skill.enableSlots,
      },
    ]),
  );
}

function toSkillRawMap(
  content: ContentPack,
  skillLevels: Map<string, number>,
): Map<string, SkillRaw> {
  const out = new Map<string, SkillRaw>();
  for (const [id, level] of skillLevels) {
    const def = content.skills.find((s) => s.id === id);
    if (!def) continue;
    out.set(id, {
      id,
      level,
      kind: def.kind,
      category: def.category,
      enableSlots: def.enableSlots,
    });
  }
  return out;
}

/**
 * 解析角色激发图（DC-057）：
 * - 存档缺键 → autoEnableMap 补齐；
 * - 显式 `null` → 强制清空该槎（保留 null，供 UI 识别「已卸下」）；
 * - 合法特殊功 id → 覆盖 auto。
 */
export function resolveEnableMap(
  content: ContentPack,
  skillLevels: Map<string, number>,
  stored?: SkillEnableMap | null,
): SkillEnableMap {
  const raw = toSkillRawMap(content, skillLevels);
  const auto = autoEnableMap(raw);
  if (!stored || Object.keys(stored).length === 0) return auto;
  const merged: SkillEnableMap = { ...auto };
  for (const [slot, skillId] of Object.entries(stored) as [keyof SkillEnableMap, string | null][]) {
    if (skillId === null || skillId === "") {
      merged[slot] = null;
      continue;
    }
    const sk = raw.get(skillId);
    if (sk?.kind === "special" && sk.enableSlots.includes(slot)) {
      merged[slot] = skillId;
    }
  }
  return merged;
}

/**
 * F0/F1/F2 共用的角色战斗体构造（DC-041/047：激发有效等级 + 装备数值 + 后天四维）。
 */
export function buildCharacterCombatant(
  content: ContentPack,
  character: CharacterCombatSource,
  skillLevels: Map<string, number>,
  resourceMode: "full" | "current" = "full",
  enableMap?: SkillEnableMap | null,
  hasWeapon = true,
): Combatant {
  const resolved = resolveEnableMap(content, skillLevels, enableMap);
  const gearStats = sumGearStats(character.equippedItemIds ?? [], content.items);
  return buildCombatant(content.params, character, {
    skills: [...skillLevels].map(([id, level]) => ({ id, level })),
    skillDefs: skillDefsFromPack(content),
    enableMap: resolved,
    hasWeapon,
    gearStats,
    resourceMode,
  });
}

/** NPC 由内容包定义；skillEnable 缺省则 autoEnable。 */
export function buildNpcCombatant(content: ContentPack, npc: Npc): Combatant {
  const level = npc.level ?? 1;
  const attrs = npc.attrs ?? { str: 10 + level, int: 10, con: 10 + level, dex: 10 + level };
  const skillLevels = new Map(npc.skills.map((skill) => [skill.skillId, skill.level]));
  const hasWeapon = npc.equipment.some((itemId) => {
    const item = content.items.find((i) => i.id === itemId);
    return item?.kind === "weapon";
  });
  const combatant = buildCharacterCombatant(
    content,
    {
      id: `npc:${npc.id}`,
      name: npc.name,
      attrs,
      exp: level * level * 100,
      equippedItemIds: [...npc.equipment],
    },
    skillLevels,
    "full",
    (npc.skillEnable as SkillEnableMap | undefined) ?? null,
    hasWeapon,
  );
  return { ...combatant, nature: npc.nature ?? "human" };
}
