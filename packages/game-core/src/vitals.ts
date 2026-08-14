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

function ticksInWindow(
  deltaMinutes: number,
  tickSeconds: number,
  maxWindowMinutes: number,
): number {
  const capped = Math.min(deltaMinutes, maxWindowMinutes);
  return (60 / tickSeconds) * capped;
}

/**
 * 自然恢复（V2.12 / DC-051；DC-058 移除食水消耗与饥渴 gate）。
 * 气/精/精力/内力按 xkx heal_up 绝对值 × 时间窗折算；贴有效上限后缓慢抬 eff（疗伤）。
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

  let nextQi = Math.min(effQi, current.qi + Math.floor(perTickQi * ticks));
  let nextJing = Math.min(effJing, current.jing + Math.floor(perTickJing * ticks));
  let nextEffQi = effQi;
  let nextEffJing = effJing;

  const wound = Math.floor(r.woundCurePerTick * ticks);
  if (nextQi >= nextEffQi && nextEffQi < max.maxQi) {
    nextEffQi = Math.min(max.maxQi, nextEffQi + wound);
    nextQi = Math.min(nextEffQi, nextQi);
  }
  if (nextJing >= nextEffJing && nextEffJing < max.maxJing) {
    nextEffJing = Math.min(max.maxJing, nextEffJing + wound);
    nextJing = Math.min(nextEffJing, nextJing);
  }

  return {
    ...current,
    qi: nextQi,
    jing: nextJing,
    jingli: Math.min(max.maxJingli, current.jingli + Math.floor(perTickJingli * ticks)),
    neili: Math.min(max.maxNeili, current.neili + Math.floor(perTickNeili * ticks)),
    effQi: nextEffQi,
    effJing: nextEffJing,
  };
}

/** 当前状态（数据库持久化字段；DC-058：food/water 列仍留库但规则层不再使用）。 */
export interface VitalsState {
  qi: number;
  jing: number;
  jingli: number;
  neili: number;
  effQi: number;
  effJing: number;
}

/** 受伤后的当前上限（eff）不得超过先天上限（max）。 */
export function clampEff(eff: number, max: number): number {
  return Math.max(0, Math.min(eff, max));
}

/** 将当前状态钳制到合法区间（0 ≤ 当前 ≤ 上限；eff ≤ max）。 */
export function clampVitals(state: VitalsState, max: MaxVitals): VitalsState {
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
    effQi,
    effJing,
  };
}

export { DEFAULT_PARAMS };
