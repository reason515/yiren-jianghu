import { paramsSchema, type Params } from "@yjh/content";

/**
 * C1 数值参数表与公式模块。
 *
 * 设计要点：
 * - 纯函数、零 IO、确定性可复现（game-core 护栏）。
 * - 参数 Schema 的单一来源在 @yjh/content（内容包作者契约），这里只做运行时装载与派生公式，
 *   避免两份定义漂移。
 * - pkuxkx 公式（如 max_potential = 100+sqrt(exp)/10、武功³/10 > exp 检查）仅作对照参考，
 *   不进入本模块；本模块数值按移动端会话节奏重设计，由内容包 params.json 驱动。
 */

export type GameParams = Params;

/** 开发默认值，与 packages/content/fixtures/pack/params.json 保持一致。 */
export const DEFAULT_PARAMS: GameParams = {
  expCurve: { base: 100, growth: 1.1 },
  potential: { learnCostFactor: 1 },
  combat: {
    baseHitRate: 0.7,
    baseDodgeRate: 0.1,
    baseParryRate: 0.15,
    hitPerAttackDiff: 0.01,
    dodgePerDodgeDiff: 0.01,
    parryPerParryDiff: 0.01,
    weaponDmgPerLevel: 0.5,
    forceDmgPerLevel: 0.4,
    defenseReduce: 0.5,
    damageVariance: 0.1,
    recoverNeiliPerTurn: 20,
    fleeBaseChance: 0.7,
  },
  afk: { maxDurationHours: 8, dailyDiminishRate: 0.5, studyAttemptsPerHour: 12 },
  regen: {
    qiPerMin: 0.02,
    jingPerMin: 0.015,
    jingliPerMin: 0.02,
    neiliPerMin: 0.01,
    maxWindowMinutes: 30,
  },
  vitals: {
    qiBase: 100,
    jingBase: 100,
    jingliBase: 100,
    qiPerCon: 16,
    qiPerStr: 0,
    jingPerInt: 16,
    forceQiPerLevel: 2,
    forceJingPerLevel: 1,
    neiliPerLevel: 10,
    jingliPerLevel: 3,
    neiliToQiDiv: 4,
    neiliToJingDiv: 12,
    foodBase: 200,
    foodPerCon: 10,
    waterBase: 200,
    waterPerDex: 10,
  },
  growth: {
    learnJingCostBase: 150,
    learnTuitionBase: 2,
    potentialCostPerLevel: 1,
    expGateExponent: 3,
    expGateDivisor: 10,
    practiceQiBase: 20,
    practiceQiPerLevel: 1,
    practicePointsPerAction: 1,
    studyJingBase: 80,
  },
  pvp: { dailyChallengeLimit: 5, kFactor: 32, seasonWeeks: 6 },
  economy: { silverDropBase: 5, maxCashflowPerDay: 1000 },
};

/** 升到下一级所需经验：base * growth^(level-1)（level 从 1 起）。 */
export function expForNextLevel(p: GameParams, level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level 必须是不小于 1 的整数");
  return Math.round(p.expCurve.base * Math.pow(p.expCurve.growth, level - 1));
}

/** 有效潜能 = potential − learned_points（已定修正，下限 0）。 */
export function effectivePotential(potential: number, learnedPoints: number): number {
  return Math.max(0, potential - learnedPoints);
}

/**
 * 挂机每日递减乘数（0 ≤ 返回值 ≤ 1）：
 * 每满一个 maxDurationHours 周期，收益乘 (1 - dailyDiminishRate)，下界为 0。
 * 单调不增，确定性可测。
 */
export function diminishMultiplier(p: GameParams, hoursUsedToday: number): number {
  if (hoursUsedToday < 0) throw new RangeError("hoursUsedToday 必须 >= 0");
  const fullCycles = Math.floor(hoursUsedToday / p.afk.maxDurationHours);
  if (fullCycles <= 0) return 1;
  return Math.max(0, Math.min(1, Math.pow(1 - p.afk.dailyDiminishRate, fullCycles)));
}

export type ParseParamsResult = { ok: true; params: GameParams } | { ok: false; errors: string[] };

/** 装载参数表（内容包 params.json → 校验 → GameParams）。 */
export function parseParams(input: unknown): ParseParamsResult {
  const result = paramsSchema.safeParse(input);
  if (result.success) return { ok: true, params: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
