import { DEFAULT_PARAMS, type GameParams } from "./params.js";

/**
 * C2 Vitals 动态上限计算。
 *
 * 参照 pkuxkx feature/attribute.c 的 query_max_qi/jing/neili/jingli 结构，
 * 但按移动端节奏重设计：首版无年龄阶段，采用成年人常数（对应 pkuxkx 31–60 段公式）；
 * 年龄衰减/内功类型系数留待后续。所有系数来自参数表 vitals 段（内容包驱动）。
 *
 * 公式（对照 pkuxkx 列）：
 * - maxNeili = forceLevel * neiliPerLevel          （pkuxkx: SKILL_D(force)->query_max_neili）
 * - maxQi    = qiBase + con*qiPerCon + str*qiPerStr + forceLevel*forceQiPerLevel
 *              + floor(maxNeili / neiliToQiDiv)     （pkuxkx: 31–60 段 + max_neili/4 + level_hp）
 * - maxJing  = jingBase + int*jingPerInt + forceLevel*forceJingPerLevel
 *              + floor(maxNeili / neiliToJingDiv)   （pkuxkx: 31+ 段 + max_neili/12）
 * - maxJingli= jingliBase + forceLevel*jingliPerLevel （pkuxkx: force_skill * jingli_times）
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

export function computeMaxVitals(p: GameParams, input: VitalsInput): MaxVitals {
  const v = p.vitals;
  const maxNeili = input.forceLevel * v.neiliPerLevel;
  const maxQi =
    v.qiBase +
    input.con * v.qiPerCon +
    input.str * v.qiPerStr +
    input.forceLevel * v.forceQiPerLevel +
    Math.floor(maxNeili / v.neiliToQiDiv);
  const maxJing =
    v.jingBase +
    input.int * v.jingPerInt +
    input.forceLevel * v.forceJingPerLevel +
    Math.floor(maxNeili / v.neiliToJingDiv);
  const maxJingli = v.jingliBase + input.forceLevel * v.jingliPerLevel;
  return { maxQi, maxJing, maxNeili, maxJingli };
}

/** 食物/饮水上限（pkuxkx: max_food_capacity / max_water_capacity 按体质/身法）。 */
export function maxFoodCapacity(p: GameParams, con: number): number {
  return p.vitals.foodBase + con * p.vitals.foodPerCon;
}

export function maxWaterCapacity(p: GameParams, dex: number): number {
  return p.vitals.waterBase + dex * p.vitals.waterPerDex;
}

/**
 * 自然恢复与食水消耗（V2.12 / DC-044，参照 pkuxkx heart_beat）：
 * 按距上次结算的分钟数恢复 qi/jing/jingli/neili（每分钟为上限的 qiPerMin 等比例），
 * 并按绝对值消耗 food/water；单次封顶窗口防离线累积。
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
