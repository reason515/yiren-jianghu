import {
  evalFormulaWithCoeffs,
  evalPiecewiseWithCoeffs,
  type CompiledMechanics,
  type Params,
} from "@yjh/content";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS } from "./params.js";

/**
 * C11 技能战力（skill_power，DC-041 / DC-046）。
 * 分段表与合成公式均在 mechanics.yaml。
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
  const expK = Math.floor(exp / 1000);
  const cubePower =
    level <= 0 ? 0 : evalPiecewiseWithCoeffs(mechanics, params, "levelCubePower", { level });
  const expBonus =
    level <= 0
      ? 0
      : evalPiecewiseWithCoeffs(mechanics, params, "combatExpBonus", { combatExp: exp, expK });
  const power = evalFormulaWithCoeffs(mechanics, params, "skillPowerBase", {
    level,
    combatExp: exp,
    cubePower,
    expBonus,
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
