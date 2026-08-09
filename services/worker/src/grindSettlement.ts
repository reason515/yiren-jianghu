import {
  processTick,
  type AfkJobState,
  type GameParams,
  type HourlyGain,
  type TickOutcome,
} from "@yjh/game-core";

/**
 * DC-042 生计挂机结算（纯函数）：按时长发三件套，耗精；精尽则本段结算后失败停工。
 */

export interface GrindSettlementInput {
  params: GameParams;
  job: AfkJobState;
  now: number;
  deltaHours: number;
  jing: number;
  hourlyGain: HourlyGain;
  jingPerHour: number;
  /** 历练超过此值不可再做（0 = 不限）；启动时已校验，tick 中再防一次。 */
  maxExp: number;
  characterExp: number;
}

export interface GrindSettlementResult {
  outcome: TickOutcome;
  jingSpent: number;
  /** 因精尽而提前结束（本段仍发收益）。 */
  exhausted: boolean;
}

export function settleGrind(input: GrindSettlementInput): GrindSettlementResult {
  if (input.maxExp > 0 && input.characterExp >= input.maxExp) {
    return {
      outcome: processTick({
        job: input.job,
        params: input.params,
        now: input.now,
        deltaHours: 0,
        hourlyGain: { exp: 0, potential: 0, silver: 0 },
        failure: "历练已够，此等杂役再做无益",
      }),
      jingSpent: 0,
      exhausted: false,
    };
  }

  const maxByJing =
    input.jingPerHour > 0 ? input.jing / input.jingPerHour : Number.POSITIVE_INFINITY;
  const hours = Math.min(input.deltaHours, maxByJing);
  if (hours <= 0) {
    return {
      outcome: processTick({
        job: input.job,
        params: input.params,
        now: input.now,
        deltaHours: 0,
        hourlyGain: { exp: 0, potential: 0, silver: 0 },
        failure: "精疲力尽，此事只好暂且放下",
      }),
      jingSpent: 0,
      exhausted: true,
    };
  }

  const outcome = processTick({
    job: input.job,
    params: input.params,
    now: input.now,
    deltaHours: hours,
    hourlyGain: input.hourlyGain,
  });
  const jingSpent = Math.min(input.jing, input.jingPerHour * hours);
  const exhausted = hours + 1e-9 < input.deltaHours && input.jingPerHour > 0;

  if (exhausted && outcome.status === "running") {
    return {
      outcome: {
        status: "failed",
        job: {
          ...outcome.job,
          status: "failed",
          stopReason: "精疲力尽，此事只好暂且放下",
        },
        gained: outcome.gained,
      },
      jingSpent,
      exhausted: true,
    };
  }

  return { outcome, jingSpent, exhausted };
}
