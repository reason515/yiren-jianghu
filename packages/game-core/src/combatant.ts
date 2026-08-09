import {
  evalFormulaWithCoeffs,
  type CompiledMechanics,
  type EnableSlot,
  type SkillCategory,
} from "@yjh/content";
import { DEFAULT_MECHANICS, type GameParams } from "./params.js";
import { computeMaxVitals } from "./vitals.js";
import type { Combatant, CombatStats } from "./combat.js";
import { effectiveLevel, type SkillEnableMap, type SkillRaw } from "./enable.js";

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

/** 角色/NPC 已学技能的原始等级输入（buildCombatant 用于计算有效等级）。 */
export interface CombatantSkillInput {
  id: string;
  level: number;
}

/** 技能定义的战斗相关子集（内容包 skillSchema 的投影）。 */
export interface CombatantSkillDef {
  kind: "basic" | "special";
  category: SkillCategory;
  enableSlots: EnableSlot[];
}

export interface BuildCombatantOptions {
  /** 角色/NPC 已学技能的原始等级。 */
  skills: CombatantSkillInput[];
  /** 技能定义（id → kind/category/enableSlots），缺失定义的技能会被忽略。 */
  skillDefs: Map<string, CombatantSkillDef>;
  /** 各槽位当前激发的特殊功 id（DC-041，见 enable.ts autoEnableMap/assertCanEnable）。 */
  enableMap: SkillEnableMap;
  /** 是否持有兵器：true → 攻击槎走 sword，否则走 unarmed。 */
  hasWeapon?: boolean;
  /** full 用于快照对战（PVP）；current 用于会影响角色实际资源的 PVE / 挂机。 */
  resourceMode?: "full" | "current";
}

/** DC-041：基本功/特殊功激发 → 有效等级注入战斗体（取代旧的门类等级取 max）。 */
export function buildCombatant(
  params: GameParams,
  source: CombatantSource & { exp?: number },
  opts: BuildCombatantOptions,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): Combatant {
  const resourceMode = opts.resourceMode ?? "full";

  const skillMap = new Map<string, SkillRaw>();
  for (const skill of opts.skills) {
    const def = opts.skillDefs.get(skill.id);
    if (!def) continue;
    skillMap.set(skill.id, {
      id: skill.id,
      level: skill.level,
      kind: def.kind,
      category: def.category,
      enableSlots: def.enableSlots,
    });
  }

  const attackSkillSlot: "sword" | "unarmed" = opts.hasWeapon ? "sword" : "unarmed";
  const forceLevel = effectiveLevel("force", skillMap, opts.enableMap, params, mechanics);
  const dodgeLevel = effectiveLevel("dodge", skillMap, opts.enableMap, params, mechanics);
  const parryLevel = effectiveLevel("parry", skillMap, opts.enableMap, params, mechanics);
  const weaponLevel = effectiveLevel(attackSkillSlot, skillMap, opts.enableMap, params, mechanics);

  const maxVitals = computeMaxVitals(params, { ...source.attrs, forceLevel }, mechanics);
  const exp = source.exp ?? 0;
  const { str, dex, con } = source.attrs;

  const stats: CombatStats = {
    attack: evalFormulaWithCoeffs(mechanics, params, "combatantAttack", { str, weaponLevel }),
    defense: evalFormulaWithCoeffs(mechanics, params, "combatantDefense", { con }),
    dodge: evalFormulaWithCoeffs(mechanics, params, "combatantDodge", {
      dex,
      dodgeLevel,
    }),
    parry: evalFormulaWithCoeffs(mechanics, params, "combatantParry", { parryLevel }),
    weaponLevel,
    forceLevel,
    attackSkillLevel: weaponLevel,
    dodgeSkillLevel: dodgeLevel,
    parrySkillLevel: parryLevel,
    combatExp: exp,
    str,
    dex,
    con,
  };

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
    stats,
    attackSkillSlot,
    effective: { force: forceLevel, dodge: dodgeLevel, parry: parryLevel, weapon: weaponLevel },
    exp,
  };
}
