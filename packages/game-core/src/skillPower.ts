/**
 * C11 技能战力（skill_power，DC-041）。
 *
 * 参照 pkuxkx include/combat/probable.h 的 skill_power：等级立方分段 + 战斗经验分段，
 * 换算出攻/防两用的“战力”值，用于命中/闪避/招架的 A/(A+B) 概率判定。
 *
 * 简化点（按任务要求）：
 * - 不接 apply 系数（apply/attack_factor 等）与一带真龙（yidaizhenlong）威压；
 * - 不做武器/空手技能合并等级（合并逻辑已在 combatant.ts 的 effectiveLevel 完成）；
 * - 防御统一按 `(dex*5+str)/6` 近似（原版 parry 用 `(dex*3+str)/4`、dodge 用纯 `dex`），
 *   本项目为简化模型，防御不再区分闪避/招架的属性权重。
 * - 全部整除按 pkuxkx 的截断语义（Math.floor，输入均非负）。
 */

export interface SkillPowerAttrs {
  str: number;
  dex: number;
}

export type SkillPowerUsage = "attack" | "defense";

/** 等级立方分段（pkuxkx: level<30/300/600/1200/1800/3000 六段）。 */
function levelCubePower(level: number): number {
  if (level < 30) return Math.floor((level * level * level) / 30);
  if (level < 300) {
    const seg = Math.floor(level / 10);
    return 900 + Math.floor((seg * seg * seg) / 3);
  }
  if (level < 600) {
    const seg = Math.floor(level / 15);
    return 7400 + Math.floor((seg * seg * seg) / 3);
  }
  if (level < 1200) {
    const seg = Math.floor(level / 20);
    return 19800 + Math.floor((seg * seg * seg) / 3);
  }
  if (level < 1800) {
    const seg = Math.floor(level / 30);
    return 70600 + Math.floor((seg * seg * seg) / 3);
  }
  if (level < 3000) {
    const seg = Math.floor(level / 50);
    return 127200 + Math.floor((seg * seg * seg) / 3);
  }
  const seg = Math.floor(level / 150);
  return 196800 + Math.floor((seg * seg * seg) / 3);
}

/** 战斗经验分段加成（pkuxkx: combat_exp/1000 六段）。 */
function combatExpBonus(combatExp: number): number {
  const expK = Math.floor(combatExp / 1000);
  if (expK < 30) return Math.floor(combatExp / 100);
  if (expK < 3000) return 270 + Math.floor(combatExp / 1000);
  if (expK < 21000) return 2270 + Math.floor(combatExp / 3000);
  if (expK < 180000) return 5770 + Math.floor(combatExp / 6000);
  if (expK < 600000) return 20770 + Math.floor(combatExp / 12000);
  return 46770 + Math.floor(combatExp / 25000);
}

/**
 * 技能/战斗经验综合战力（A/(A+B) 概率用）。
 * level ≤ 0 时按 pkuxkx 惯例直接以 `combat_exp/50` 作为基础战力（先天属性决定）。
 */
export function skillPower(
  level: number,
  combatExp: number,
  attrs: SkillPowerAttrs,
  usage: SkillPowerUsage,
): number {
  const exp = Math.max(0, combatExp);
  let power = level <= 0 ? Math.floor(exp / 50) : levelCubePower(level) + combatExpBonus(exp);
  if (power === 0) power = 1;
  const weighted = usage === "attack" ? attrs.str * 5 + attrs.dex : attrs.dex * 5 + attrs.str;
  return Math.floor((power * weighted) / 6);
}
