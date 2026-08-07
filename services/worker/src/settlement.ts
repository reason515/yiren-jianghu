import { studyOnce, type GameParams, type SkillMap } from "@yjh/game-core";

/**
 * F2 修炼挂机结算（纯函数，worker 与测试共用）。
 * 挂机收益 = 逐次参悟（studyOnce）：每 attempts 次尝试消耗精、积累练习点/升级；
 * 精不足或满级则提前停止。exp/potential/silver 三件套归零（修炼只涨武功）。
 */

export interface StudySettlementInput {
  params: GameParams;
  /** 结算开始时角色的精。 */
  jing: number;
  skillId: string;
  skills: SkillMap;
  maxLevel: number;
  /** 本次可尝试次数（时长 × 每小时次数）。 */
  attempts: number;
}

export interface StudySettlementResult {
  skills: SkillMap;
  jingSpent: number;
  attempts: number;
  levelsGained: number;
}

export function settleStudy(input: StudySettlementInput): StudySettlementResult {
  let jing = input.jing;
  let skills = input.skills;
  let attempts = 0;
  let levelsGained = 0;
  for (let i = 0; i < input.attempts; i++) {
    const r = studyOnce({
      params: input.params,
      jing,
      skillId: input.skillId,
      skills,
      maxLevel: input.maxLevel,
    });
    if (!r.ok) break; // 精不足或已满级
    skills = r.skills;
    jing -= r.jingSpent;
    attempts += 1;
    if (r.leveled) levelsGained += 1;
  }
  return { skills, jingSpent: input.jing - jing, attempts, levelsGained };
}

/** 结算次数 = 时长（小时）× 每小时次数，封顶防失控。 */
export function attemptsForHours(hours: number, attemptsPerHour: number): number {
  const raw = Math.floor(hours * attemptsPerHour);
  return Math.min(Math.max(0, raw), 2000);
}
