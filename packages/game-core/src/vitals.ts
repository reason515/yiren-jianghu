import { evalFormulaWithCoeffs, type CompiledMechanics } from "@yjh/content";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS, type GameParams } from "./params.js";

/**
 * C2 Vitals 动态上限计算（DC-046：公式在 mechanics.yaml）。
 */

export interface VitalsInput {
  str: number;
  int: number;
  con: number;
  dex: number;
  /** 已装备内功的有效等级（无内功 = 0）。 */
  forceLevel: number;
}

export interface MaxVitals {
  maxQi: number;
  maxJing: number;
  maxNeili: number;
  maxJingli: number;
}

export function computeMaxVitals(
  p: GameParams,
  input: VitalsInput,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): MaxVitals {
  const vars = {
    str: input.str,
    int: input.int,
    con: input.con,
    dex: input.dex,
    forceLevel: input.forceLevel,
  };
  return {
    maxNeili: evalFormulaWithCoeffs(mechanics, p, "maxNeili", vars),
    maxQi: evalFormulaWithCoeffs(mechanics, p, "maxQi", vars),
    maxJing: evalFormulaWithCoeffs(mechanics, p, "maxJing", vars),
    maxJingli: evalFormulaWithCoeffs(mechanics, p, "maxJingli", vars),
  };
}

/** 食物/饮水上限。 */
export function maxFoodCapacity(
  p: GameParams,
  con: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return evalFormulaWithCoeffs(mechanics, p, "maxFood", { con });
}

export function maxWaterCapacity(
  p: GameParams,
  dex: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return evalFormulaWithCoeffs(mechanics, p, "maxWater", { dex });
}

/**
 * 自然恢复与食水消耗（V2.12 / DC-044）：速率系数仍在 coeffs.regen。
 */
export function applyRegen(
  current: VitalsState,
  max: MaxVitals,
  deltaMinutes: number,
  p: GameParams,
): VitalsState {
  const r = p.regen;
  const capped = Math.min(deltaMinutes, r.maxWindowMinutes);
  const gain = (maxValue: number, perMin: number): number => Math.floor(maxValue * perMin * capped);
  const drain = (perMin: number | undefined): number => Math.floor((perMin ?? 0) * capped);
  return {
    ...current,
    qi: Math.min(max.maxQi, current.qi + gain(max.maxQi, r.qiPerMin)),
    jing: Math.min(max.maxJing, current.jing + gain(max.maxJing, r.jingPerMin)),
    jingli: Math.min(max.maxJingli, current.jingli + gain(max.maxJingli, r.jingliPerMin)),
    neili: Math.min(max.maxNeili, current.neili + gain(max.maxNeili, r.neiliPerMin)),
    food: Math.max(0, current.food - drain(r.foodPerMin)),
    water: Math.max(0, current.water - drain(r.waterPerMin)),
  };
}

/** 当前状态（数据库持久化字段）。 */
export interface VitalsState {
  qi: number;
  jing: number;
  jingli: number;
  neili: number;
  food: number;
  water: number;
  effQi: number;
  effJing: number;
}

/** 受伤后的当前上限（eff）不得超过先天上限（max）。 */
export function clampEff(eff: number, max: number): number {
  return Math.max(0, Math.min(eff, max));
}

/** 将当前状态钳制到合法区间（0 ≤ 当前 ≤ 上限；eff ≤ max）。 */
export function clampVitals(
  state: VitalsState,
  max: MaxVitals,
  foodCap: number,
  waterCap: number,
): VitalsState {
  const qi = Math.max(0, Math.min(state.qi, max.maxQi));
  const jing = Math.max(0, Math.min(state.jing, max.maxJing));
  return {
    qi,
    jing,
    jingli: Math.max(0, Math.min(state.jingli, max.maxJingli)),
    neili: Math.max(0, Math.min(state.neili, max.maxNeili)),
    food: Math.max(0, Math.min(state.food, foodCap)),
    water: Math.max(0, Math.min(state.water, waterCap)),
    effQi: clampEff(state.effQi, max.maxQi),
    effJing: clampEff(state.effJing, max.maxJing),
  };
}

export { DEFAULT_PARAMS };
