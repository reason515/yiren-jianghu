import type { GameParams } from "./params.js";
import { computeMaxVitals } from "./vitals.js";
import type { Combatant } from "./combat.js";

/**
 * PVE、PVP 与行侠挂机共用的战斗体输入。
 * 调用方只负责把内容包技能映射为门类等级；属性和动态上限公式只在此处保留一份。
 */
export interface CombatantSource {
  id: string;
  name: string;
  attrs: { str: number; int: number; con: number; dex: number };
  qi?: number;
  jing?: number;
  neili?: number;
}

export interface CombatSkillLevel {
  category: "force" | "weapon" | "dodge" | "parry" | "knowledge";
  level: number;
}

/** full 用于快照对战；current 用于会影响角色实际资源的 PVE / 挂机。 */
export function buildCombatant(
  params: GameParams,
  source: CombatantSource,
  skills: Iterable<CombatSkillLevel>,
  resourceMode: "full" | "current" = "full",
): Combatant {
  const levelsByCategory = new Map<string, number>();
  for (const skill of skills) {
    levelsByCategory.set(
      skill.category,
      Math.max(levelsByCategory.get(skill.category) ?? 0, skill.level),
    );
  }
  const weaponLevel = levelsByCategory.get("weapon") ?? 0;
  const forceLevel = levelsByCategory.get("force") ?? 0;
  const dodgeLevel = levelsByCategory.get("dodge") ?? 0;
  const parryLevel = levelsByCategory.get("parry") ?? 0;
  const maxVitals = computeMaxVitals(params, { ...source.attrs, forceLevel });

  return {
    id: source.id,
    name: source.name,
    qi: resourceMode === "current" ? Math.max(0, source.qi ?? maxVitals.maxQi) : maxVitals.maxQi,
    maxQi: maxVitals.maxQi,
    jing:
      resourceMode === "current"
        ? Math.max(0, source.jing ?? maxVitals.maxJing)
        : maxVitals.maxJing,
    maxJing: maxVitals.maxJing,
    neili:
      resourceMode === "current"
        ? Math.max(0, source.neili ?? maxVitals.maxNeili)
        : maxVitals.maxNeili,
    maxNeili: maxVitals.maxNeili,
    stats: {
      attack: 10 + source.attrs.str + weaponLevel * 2,
      defense: 10 + source.attrs.con,
      dodge: 5 + source.attrs.dex + dodgeLevel,
      parry: 5 + parryLevel,
      weaponLevel,
      forceLevel,
    },
  };
}
