import {
  exerciseOnce,
  practiceOnce,
  respirateOnce,
  type GameParams,
  type SkillMap,
} from "@yjh/game-core";

/**
 * F2 修炼挂机结算（纯函数，worker 与测试共用）。
 */

export interface PracticeSettlementInput {
  params: GameParams;
  qi: number;
  skillId: string;
  skills: SkillMap;
  maxLevel: number;
  attempts: number;
}

export interface PracticeSettlementResult {
  skills: SkillMap;
  qiSpent: number;
  attempts: number;
  levelsGained: number;
}

/** 练功挂机：逐次 practiceOnce，耗气涨武功。 */
export function settlePractice(input: PracticeSettlementInput): PracticeSettlementResult {
  let qi = input.qi;
  let skills = input.skills;
  let attempts = 0;
  let levelsGained = 0;
  for (let i = 0; i < input.attempts; i++) {
    const r = practiceOnce({
      params: input.params,
      qi,
      skillId: input.skillId,
      skills,
      maxLevel: input.maxLevel,
    });
    if (!r.ok) break;
    skills = r.skills;
    qi -= r.qiSpent;
    attempts += 1;
    if (r.leveled) levelsGained += 1;
  }
  return { skills, qiSpent: input.qi - qi, attempts, levelsGained };
}

/** @deprecated 兼容旧 study 作业；内部走 practiceOnce。 */
export function settleStudy(input: PracticeSettlementInput): PracticeSettlementResult {
  return settlePractice(input);
}

export interface DazuoSettlementInput {
  params: GameParams;
  qi: number;
  neili: number;
  maxNeili: number;
  forceLevel: number;
  attempts: number;
}

export interface DazuoSettlementResult {
  qiSpent: number;
  neiliGained: number;
  maxNeiliUp: number;
  neili: number;
  maxNeili: number;
  attempts: number;
}

export function settleDazuo(input: DazuoSettlementInput): DazuoSettlementResult {
  let qi = input.qi;
  let neili = input.neili;
  let maxNeili = input.maxNeili;
  let qiSpent = 0;
  let neiliGained = 0;
  let maxNeiliUp = 0;
  let attempts = 0;
  for (let i = 0; i < input.attempts; i++) {
    const r = exerciseOnce({
      params: input.params,
      qi,
      neili,
      maxNeili,
      forceLevel: input.forceLevel,
    });
    if (!r.ok) break;
    qi -= r.qiSpent;
    neili = r.neili;
    maxNeili = r.maxNeili;
    qiSpent += r.qiSpent;
    neiliGained += r.neiliGained;
    maxNeiliUp += r.maxNeiliUp;
    attempts += 1;
  }
  return { qiSpent, neiliGained, maxNeiliUp, neili, maxNeili, attempts };
}

export interface TunaSettlementInput {
  params: GameParams;
  jing: number;
  jingli: number;
  maxJingli: number;
  forceLevel: number;
  attempts: number;
}

export interface TunaSettlementResult {
  jingSpent: number;
  jingliGained: number;
  maxJingliUp: number;
  jingli: number;
  maxJingli: number;
  attempts: number;
}

export function settleTuna(input: TunaSettlementInput): TunaSettlementResult {
  let jing = input.jing;
  let jingli = input.jingli;
  let maxJingli = input.maxJingli;
  let jingSpent = 0;
  let jingliGained = 0;
  let maxJingliUp = 0;
  let attempts = 0;
  for (let i = 0; i < input.attempts; i++) {
    const r = respirateOnce({
      params: input.params,
      jing,
      jingli,
      maxJingli,
      forceLevel: input.forceLevel,
    });
    if (!r.ok) break;
    jing -= r.jingSpent;
    jingli = r.jingli;
    maxJingli = r.maxJingli;
    jingSpent += r.jingSpent;
    jingliGained += r.jingliGained;
    maxJingliUp += r.maxJingliUp;
    attempts += 1;
  }
  return { jingSpent, jingliGained, maxJingliUp, jingli, maxJingli, attempts };
}

/** 结算次数 = 时长（小时）× 每小时次数，封顶防失控。 */
export function attemptsForHours(hours: number, attemptsPerHour: number): number {
  const raw = Math.floor(hours * attemptsPerHour);
  return Math.min(Math.max(0, raw), 2000);
}
