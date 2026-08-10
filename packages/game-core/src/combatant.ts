import {
  evalFormulaWithCoeffs,
  type CompiledMechanics,
  type EnableSlot,
  type SkillCategory,
} from "@yjh/content";
import { acquiredAttrs, attrLevelsFromSkills } from "./attrs.js";
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
  /** 先天四维（建角写入值）；后天由技能叠算（DC-047）。 */
  attrs: { str: number; int: number; con: number; dex: number };
  qi?: number;
  jing?: number;
  neili?: number;
  /** 有效气血上限（伤势）；缺省 = maxQi（DC-048）。 */
  effQi?: number;
  effJing?: number;
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

/** 已装备物品数值（DC-047）；来自 item.stats 求和。 */
export interface GearStats {
  attack?: number;
  defense?: number;
  dodge?: number;
  parry?: number;
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
  /** 装备数值叠加（DC-047）。 */
  gearStats?: GearStats;
  /** full 用于快照对战（PVP）；current 用于会影响角色实际资源的 PVE / 挂机。 */
  resourceMode?: "full" | "current";
  /**
   * attrs 是否已是后天（调用方已算好）。缺省 false：内部用技能叠算后天。
   * NPC 内容包 attrs 视为先天并叠算。
   */
  attrsAreAcquired?: boolean;
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
  const skillList: Array<{ category: string; level: number; kind?: string }> = [];
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
    skillList.push({ category: def.category, level: skill.level, kind: def.kind });
  }

  const attackSkillSlot: "sword" | "unarmed" = opts.hasWeapon ? "sword" : "unarmed";
  const forceLevel = effectiveLevel("force", skillMap, opts.enableMap, params, mechanics);
  const dodgeLevel = effectiveLevel("dodge", skillMap, opts.enableMap, params, mechanics);
  const parryLevel = effectiveLevel("parry", skillMap, opts.enableMap, params, mechanics);
  const weaponLevel = effectiveLevel(attackSkillSlot, skillMap, opts.enableMap, params, mechanics);
  const unarmedLevel = effectiveLevel("unarmed", skillMap, opts.enableMap, params, mechanics);

  const acquired = opts.attrsAreAcquired
    ? source.attrs
    : acquiredAttrs(
        source.attrs,
        attrLevelsFromSkills(skillList, {
          force: forceLevel,
          dodge: dodgeLevel,
          unarmed: unarmedLevel,
        }),
      );

  const gear = opts.gearStats ?? {};
  const maxVitals = computeMaxVitals(params, { ...acquired, forceLevel }, mechanics);
  const exp = source.exp ?? 0;
  const { str, dex, con } = acquired;

  const stats: CombatStats = {
    attack:
      evalFormulaWithCoeffs(mechanics, params, "combatantAttack", { str, weaponLevel }) +
      (gear.attack ?? 0),
    defense:
      evalFormulaWithCoeffs(mechanics, params, "combatantDefense", { con }) + (gear.defense ?? 0),
    dodge:
      evalFormulaWithCoeffs(mechanics, params, "combatantDodge", {
        dex,
        dodgeLevel,
      }) + (gear.dodge ?? 0),
    parry:
      evalFormulaWithCoeffs(mechanics, params, "combatantParry", { parryLevel }) +
      (gear.parry ?? 0),
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

  const maxQi = maxVitals.maxQi;
  const maxJing = maxVitals.maxJing;
  const effQi =
    resourceMode === "current" ? Math.min(maxQi, Math.max(0, source.effQi ?? maxQi)) : maxQi;
  const effJing =
    resourceMode === "current"
      ? Math.min(maxJing, Math.max(0, source.effJing ?? maxJing))
      : maxJing;

  return {
    id: source.id,
    name: source.name,
    qi: resourceMode === "current" ? Math.min(effQi, Math.max(0, source.qi ?? effQi)) : maxQi,
    maxQi,
    effQi,
    jing:
      resourceMode === "current" ? Math.min(effJing, Math.max(0, source.jing ?? effJing)) : maxJing,
    maxJing,
    effJing,
    neili:
      resourceMode === "current"
        ? Math.max(0, source.neili ?? maxVitals.maxNeili)
        : maxVitals.maxNeili,
    maxNeili: maxVitals.maxNeili,
    stats,
    attackSkillSlot,
    effective: {
      force: forceLevel,
      dodge: dodgeLevel,
      parry: parryLevel,
      weapon: weaponLevel,
      unarmed: unarmedLevel,
    },
    exp,
    busyTurns: 0,
    jiali: 0,
    defenseBuff: 0,
    defenseBuffTurns: 0,
    poisonTurns: 0,
    poisonDmg: 0,
  };
}

/** 汇总已装备物品的 stats（DC-047）。 */
export function sumGearStats(
  itemIds: string[],
  items: Array<{ id: string; stats?: GearStats }>,
): GearStats {
  const byId = new Map(items.map((item) => [item.id, item]));
  const out: GearStats = {};
  for (const id of itemIds) {
    const stats = byId.get(id)?.stats;
    if (!stats) continue;
    out.attack = (out.attack ?? 0) + (stats.attack ?? 0);
    out.defense = (out.defense ?? 0) + (stats.defense ?? 0);
    out.dodge = (out.dodge ?? 0) + (stats.dodge ?? 0);
    out.parry = (out.parry ?? 0) + (stats.parry ?? 0);
  }
  return out;
}
