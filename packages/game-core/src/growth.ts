import type { GameParams } from "./params.js";
import { effectivePotential } from "./params.js";

/**
 * C5 技能成长：learn（师父教学）/ practice（自练）/ study（读书领悟）。
 *
 * 参照 pkuxkx：
 * - exp 门槛：武功³/10 > 经验 无法深造（"深层次钻研"），重设为参数表 expGateExponent/Divisor；
 * - 学习精耗：pkuxkx `150/int`，本模块 learnJingCostBase/int；
 * - 有效潜能 = potential − learned_points（learn 计入 learned_points）。
 *
 * 模型：
 * - learn：1 次升 1 级，消耗潜能 + 精；受 exp 门槛 / 潜能 / 精 / maxLevel 约束。
 * - practice：消耗气血积累练习点，攒够 level+1 点升 1 级。
 * - study：与 practice 同理，消耗精（读书/领悟）。
 * 全部纯函数、不可变输入、确定性。
 */

export interface SkillProgress {
  level: number;
  /** practice/study 积累的进度点。 */
  practicePoints: number;
}

export type SkillMap = Record<string, SkillProgress>;

export function getSkill(skills: SkillMap, skillId: string): SkillProgress {
  return skills[skillId] ?? { level: 0, practicePoints: 0 };
}

// ---------- learn ----------

export interface LearnInput {
  params: GameParams;
  exp: number;
  /** 总潜能（有效值 = potential − learnedPoints）。 */
  potential: number;
  /** 已计入学习的潜能（learn 后需同步增加）。 */
  learnedPoints: number;
  jing: number;
  int: number;
  skillId: string;
  skills: SkillMap;
  /** 技能定义 maxLevel。 */
  maxLevel: number;
}

export type LearnFailure = "exp_gate" | "potential" | "jing" | "max_level";

export type LearnResult =
  | { ok: true; skills: SkillMap; potentialSpent: number; jingSpent: number }
  | { ok: false; reason: LearnFailure; skills: SkillMap };

/** 目标等级是否允许（exp 门槛）：level^exponent / divisor ≤ exp。 */
export function isLevelAllowed(params: GameParams, exp: number, level: number): boolean {
  const required = Math.pow(level, params.growth.expGateExponent) / params.growth.expGateDivisor;
  return exp >= required;
}

export function potentialCostForNext(params: GameParams, nextLevel: number): number {
  return Math.ceil(nextLevel * params.growth.potentialCostPerLevel);
}

export function jingCostForLearn(params: GameParams, int: number): number {
  return Math.max(1, Math.ceil(params.growth.learnJingCostBase / Math.max(1, int)));
}

/** 学一级（成功则技能 +1 级）。 */
export function learnUp(input: LearnInput): LearnResult {
  const { params, skills, skillId, maxLevel } = input;
  const cur = getSkill(skills, skillId);
  const nextLevel = cur.level + 1;
  if (nextLevel > maxLevel) return { ok: false, reason: "max_level", skills };
  if (!isLevelAllowed(params, input.exp, nextLevel))
    return { ok: false, reason: "exp_gate", skills };
  const cost = potentialCostForNext(params, nextLevel);
  if (effectivePotential(input.potential, input.learnedPoints) < cost) {
    return { ok: false, reason: "potential", skills };
  }
  const jingCost = jingCostForLearn(params, input.int);
  if (input.jing < jingCost) return { ok: false, reason: "jing", skills };
  return {
    ok: true,
    skills: { ...skills, [skillId]: { level: nextLevel, practicePoints: 0 } },
    potentialSpent: cost,
    jingSpent: jingCost,
  };
}

// ---------- practice ----------

export function practicePointsNeeded(params: GameParams, level: number): number {
  return level + 1;
}

export function practiceCost(params: GameParams, level: number): number {
  return params.growth.practiceQiBase + level * params.growth.practiceQiPerLevel;
}

export interface PracticeInput {
  params: GameParams;
  qi: number;
  skillId: string;
  skills: SkillMap;
  maxLevel: number;
}

export type PracticeFailure = "qi" | "max_level";

export type PracticeResult =
  | { ok: true; leveled: boolean; skills: SkillMap; qiSpent: number }
  | { ok: false; reason: PracticeFailure; skills: SkillMap };

/** 自练一次：消耗气血，积累进度点；攒够则升 1 级。 */
export function practiceOnce(input: PracticeInput): PracticeResult {
  const { params, skills, skillId, maxLevel } = input;
  const cur = getSkill(skills, skillId);
  if (cur.level >= maxLevel) return { ok: false, reason: "max_level", skills };
  const cost = practiceCost(params, cur.level);
  if (input.qi < cost) return { ok: false, reason: "qi", skills };
  const points = cur.practicePoints + params.growth.practicePointsPerAction;
  const needed = practicePointsNeeded(params, cur.level);
  const leveled = points >= needed;
  const next = leveled
    ? { level: cur.level + 1, practicePoints: 0 }
    : { level: cur.level, practicePoints: points };
  return { ok: true, leveled, skills: { ...skills, [skillId]: next }, qiSpent: cost };
}

// ---------- study（读书/领悟，消耗精） ----------

export function studyCost(params: GameParams, level: number): number {
  return Math.max(1, params.growth.studyJingBase + level);
}

export interface StudyInput {
  params: GameParams;
  jing: number;
  skillId: string;
  skills: SkillMap;
  maxLevel: number;
}

export type StudyResult =
  | { ok: true; leveled: boolean; skills: SkillMap; jingSpent: number }
  | { ok: false; reason: PracticeFailure; skills: SkillMap };

/** 读书/领悟一次：消耗精，机制同 practice。 */
export function studyOnce(input: StudyInput): StudyResult {
  const { params, skills, skillId, maxLevel } = input;
  const cur = getSkill(skills, skillId);
  if (cur.level >= maxLevel) return { ok: false, reason: "max_level", skills };
  const cost = studyCost(params, cur.level);
  if (input.jing < cost) return { ok: false, reason: "qi", skills };
  const points = cur.practicePoints + params.growth.practicePointsPerAction;
  const needed = practicePointsNeeded(params, cur.level);
  const leveled = points >= needed;
  const next = leveled
    ? { level: cur.level + 1, practicePoints: 0 }
    : { level: cur.level, practicePoints: points };
  return { ok: true, leveled, skills: { ...skills, [skillId]: next }, jingSpent: cost };
}
