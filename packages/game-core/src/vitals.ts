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

/** 自然恢复用的四维与内功等级（DC-051：对齐 xkx heal_up 绝对值）。 */
export interface RegenAttrs {
  str: number;
  con: number;
  dex: number;
  forceLevel: number;
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

function ticksInWindow(
  deltaMinutes: number,
  tickSeconds: number,
  maxWindowMinutes: number,
): number {
  const capped = Math.min(deltaMinutes, maxWindowMinutes);
  return (60 / tickSeconds) * capped;
}

/**
 * 自然恢复与食水消耗（V2.12 / DC-044 / DC-051）。
 * 气/精/精力/内力按 xkx heal_up 绝对值 × 时间窗折算；食水按绝对值消耗。
 * 饥渴时不回气精（对齐 xkx）；贴有效上限后缓慢抬 eff（疗伤）。
 */
export function applyRegen(
  current: VitalsState,
  max: MaxVitals,
  deltaMinutes: number,
  p: GameParams,
  attrs: RegenAttrs,
): VitalsState {
  const r = p.regen;
  const ticks = ticksInWindow(deltaMinutes, r.tickSeconds, r.maxWindowMinutes);
  const drain = (perMin: number | undefined): number =>
    Math.floor((perMin ?? 0) * Math.min(deltaMinutes, r.maxWindowMinutes));

  const effQi = current.effQi > 0 ? clampEff(current.effQi, max.maxQi) : max.maxQi;
  const effJing = current.effJing > 0 ? clampEff(current.effJing, max.maxJing) : max.maxJing;

  const perTickQi = Math.max(
    r.minVitalPerTick,
    Math.floor(attrs.con / r.qiConDiv) + Math.floor(max.maxNeili / r.qiNeiliDiv),
  );
  const perTickJing = Math.max(
    r.minVitalPerTick,
    Math.floor(attrs.con / r.jingConDiv) + Math.floor(max.maxJingli / r.jingJingliDiv),
  );
  const perTickJingli = Math.max(0, Math.floor((attrs.str + attrs.dex) / r.jingliAttrDiv));
  const perTickNeili =
    max.maxNeili > 0 ? Math.max(0, Math.floor(attrs.forceLevel / r.neiliForceDiv)) : 0;

  const hungry = current.food < 1 || current.water < 1;
  let nextQi = current.qi;
  let nextJing = current.jing;
  let nextEffQi = effQi;
  let nextEffJing = effJing;

  if (!hungry) {
    nextQi = Math.min(effQi, current.qi + Math.floor(perTickQi * ticks));
    nextJing = Math.min(effJing, current.jing + Math.floor(perTickJing * ticks));
    const wound = Math.floor(r.woundCurePerTick * ticks);
    if (nextQi >= nextEffQi && nextEffQi < max.maxQi) {
      nextEffQi = Math.min(max.maxQi, nextEffQi + wound);
      nextQi = Math.min(nextEffQi, nextQi);
    }
    if (nextJing >= nextEffJing && nextEffJing < max.maxJing) {
      nextEffJing = Math.min(max.maxJing, nextEffJing + wound);
      nextJing = Math.min(nextEffJing, nextJing);
    }
  }

  return {
    ...current,
    qi: nextQi,
    jing: nextJing,
    jingli: Math.min(max.maxJingli, current.jingli + Math.floor(perTickJingli * ticks)),
    neili: Math.min(max.maxNeili, current.neili + Math.floor(perTickNeili * ticks)),
    food: Math.max(0, current.food - drain(r.foodPerMin)),
    water: Math.max(0, current.water - drain(r.waterPerMin)),
    effQi: nextEffQi,
    effJing: nextEffJing,
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
  const effQi = clampEff(state.effQi, max.maxQi);
  const effJing = clampEff(state.effJing, max.maxJing);
  // DC-048：当前气/精不超过有效上限；eff=0 视为未追踪伤势，回退先天上限。
  const qiCap = effQi > 0 ? Math.min(max.maxQi, effQi) : max.maxQi;
  const jingCap = effJing > 0 ? Math.min(max.maxJing, effJing) : max.maxJing;
  return {
    qi: Math.max(0, Math.min(state.qi, qiCap)),
    jing: Math.max(0, Math.min(state.jing, jingCap)),
    jingli: Math.max(0, Math.min(state.jingli, max.maxJingli)),
    neili: Math.max(0, Math.min(state.neili, max.maxNeili)),
    food: Math.max(0, Math.min(state.food, foodCap)),
    water: Math.max(0, Math.min(state.water, waterCap)),
    effQi,
    effJing,
  };
}

export { DEFAULT_PARAMS };
