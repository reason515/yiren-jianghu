import { evalFormulaWithCoeffs, type CompiledMechanics, type Params } from "@yjh/content";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS } from "./params.js";

/**
 * 技能战力（DC-041 / 小数值重标）。
 * 基底≈有效等级，经属性权重与 levelScale 压缩后输出落在百～千级，供 A/(A+B) 判定。
 */

export interface SkillPowerAttrs {
  str: number;
  dex: number;
}

export type SkillPowerUsage = "attack" | "defense";

export function skillPower(
  level: number,
  combatExp: number,
  attrs: SkillPowerAttrs,
  usage: SkillPowerUsage,
  params: Params = DEFAULT_PARAMS,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  const exp = Math.max(0, combatExp);
  const power = evalFormulaWithCoeffs(mechanics, params, "skillPowerBase", {
    level,
    combatExp: exp,
    cubePower: 0,
    expBonus: 0,
  });
  const weighted =
    usage === "attack"
      ? attrs.str * params.skillPower.strWeight + attrs.dex
      : attrs.dex * params.skillPower.strWeight + attrs.str;
  return evalFormulaWithCoeffs(mechanics, params, "skillPowerWeighted", {
    power,
    weighted,
  });
}
