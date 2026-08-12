import type { GameParams } from "./params.js";
import { diminishMultiplier } from "./params.js";

/**
 * C7 挂机作业（AFK Job）规则层：生命周期状态机 + 收益结算 + 战报（纯函数）。
 *
 * 服务端持久化作业：App 退出后由 Worker 继续 tick；重连只订阅状态与未读战报。
 * 本模块只做规则；Redis 延迟队列调度、DB 持久化、房间导航在服务层（worker/G 阶段）接线。
 *
 * - 时长上限：startedAt + maxDurationHours（到期 → completed）；
 * - 每日递减：跨天重置 hoursToday，收益乘 diminishMultiplier（C1）；
 * - 暂停/恢复：暂停时长顺延 scheduledEndAt，不惩罚玩家；
 * - 任务型挂机相位：accept → travel → fight → report（低血 → rest），纯转换表；
 * - 修炼型挂机（study）：每 tick 调 growth.studyOnce/practiceOnce（C5），本模块管生命周期。
 */

export type AfkJobStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
export type AfkJobKind = "quest" | "study" | "grind" | "practice" | "dazuo" | "tuna";

export interface GainAccum {
  exp: number;
  potential: number;
  silver: number;
}

export type HourlyGain = GainAccum;

export interface AfkJobState {
  id: string;
  characterId: string;
  kind: AfkJobKind;
  status: AfkJobStatus;
  phase: string;
  startedAt: number;
  lastTickAt: number;
  scheduledEndAt: number;
  /** 收益递减按天（YYYY-MM-DD，UTC 日期键；时区策略服务层定）。 */
  day: string;
  hoursToday: number;
  tickCount: number;
  stopReason?: string;
  gains: GainAccum;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function createJob(input: {
  id: string;
  characterId: string;
  kind: AfkJobKind;
  now: number;
  params: GameParams;
}): AfkJobState {
  const maxHours = input.params.afk.maxDurationHours;
  return {
    id: input.id,
    characterId: input.characterId,
    kind: input.kind,
    status: "running",
    phase: "init",
    startedAt: input.now,
    lastTickAt: input.now,
    scheduledEndAt: input.now + maxHours * 3_600_000,
    day: dayKey(input.now),
    hoursToday: 0,
    tickCount: 0,
    gains: { exp: 0, potential: 0, silver: 0 },
  };
}

export function isExpired(job: AfkJobState, now: number): boolean {
  return now >= job.scheduledEndAt;
}

/** 跨天重置今日小时数（收益递减随之重置）。 */
export function rollDay(job: AfkJobState, now: number): { day: string; hoursToday: number } {
  const d = dayKey(now);
  return d === job.day ? { day: job.day, hoursToday: job.hoursToday } : { day: d, hoursToday: 0 };
}

/** 结算一段挂机时长：收益 = 小时收益 × 时长 × 递减乘数（按段末累计小时）。 */
export function settleTick(input: {
  job: AfkJobState;
  params: GameParams;
  now: number;
  deltaHours: number;
  hourlyGain: HourlyGain;
}): { job: AfkJobState; gained: GainAccum } {
  const rolled = rollDay(input.job, input.now);
  const totalHours = rolled.hoursToday + input.deltaHours;
  const factor = diminishMultiplier(input.params, totalHours);
  const gained: GainAccum = {
    exp: input.hourlyGain.exp * input.deltaHours * factor,
    potential: input.hourlyGain.potential * input.deltaHours * factor,
    silver: input.hourlyGain.silver * input.deltaHours * factor,
  };
  const job: AfkJobState = {
    ...input.job,
    day: rolled.day,
    hoursToday: totalHours,
    lastTickAt: input.now,
    tickCount: input.job.tickCount + 1,
    gains: {
      exp: input.job.gains.exp + gained.exp,
      potential: input.job.gains.potential + gained.potential,
      silver: input.job.gains.silver + gained.silver,
    },
  };
  return { job, gained };
}

export type TickOutcome =
  | { status: "running"; job: AfkJobState; gained: GainAccum }
  | { status: "completed"; job: AfkJobState; gained: GainAccum }
  | { status: "failed"; job: AfkJobState; gained: GainAccum };

export interface ProcessTickInput {
  job: AfkJobState;
  params: GameParams;
  now: number;
  deltaHours: number;
  hourlyGain: HourlyGain;
  /** 业务失败原因（如目标不可达、资源耗尽），非空则直接 failed。 */
  failure?: string;
}

export function processTick(input: ProcessTickInput): TickOutcome {
  if (input.failure) {
    return {
      status: "failed",
      job: { ...input.job, status: "failed", stopReason: input.failure },
      gained: { exp: 0, potential: 0, silver: 0 },
    };
  }
  const { job, gained } = settleTick({
    job: input.job,
    params: input.params,
    now: input.now,
    deltaHours: input.deltaHours,
    hourlyGain: input.hourlyGain,
  });
  if (isExpired(job, input.now)) {
    return {
      status: "completed",
      job: { ...job, status: "completed", stopReason: "时长上限" },
      gained,
    };
  }
  return { status: "running", job, gained };
}

/** 暂停（维护/玩家中断）：不惩罚，恢复时顺延结束时间。 */
export function pauseJob(job: AfkJobState, now: number, reason?: string): AfkJobState {
  return { ...job, status: "paused", lastTickAt: now, stopReason: reason };
}

export function resumeJob(job: AfkJobState, pausedForMs: number, now: number): AfkJobState {
  return {
    ...job,
    status: "running",
    scheduledEndAt: job.scheduledEndAt + pausedForMs,
    lastTickAt: now,
    stopReason: undefined,
  };
}

export function cancelJob(job: AfkJobState, now: number, reason: string): AfkJobState {
  return { ...job, status: "cancelled", lastTickAt: now, stopReason: reason };
}

// ---------- 任务型挂机相位（四相 + 低血休整） ----------

export type QuestPhase = "accept" | "travel" | "fight" | "report" | "rest";

export type QuestPhaseEvent =
  "task_accepted" | "arrived" | "target_killed" | "rewarded" | "low_hp" | "recovered";

/** 相位转换表（数据驱动，服务层按玩家数据判定事件）。 */
export function advanceQuestPhase(phase: QuestPhase, ev: QuestPhaseEvent): QuestPhase | "done" {
  switch (phase) {
    case "accept":
      return ev === "task_accepted" ? "travel" : "accept";
    case "travel":
      return ev === "arrived" ? "fight" : "travel";
    case "fight":
      return ev === "target_killed" ? "report" : "fight";
    case "report":
      return ev === "rewarded" ? "done" : "report";
    case "rest":
      return ev === "recovered" ? "travel" : "rest";
  }
}

/** 任意相位遇低血 → rest；rest 恢复后回 travel。 */
export function enterRest(phase: QuestPhase): QuestPhase {
  return phase === "rest" ? "rest" : "rest";
}

// ---------- 战报 ----------

export interface AfkReport {
  jobId: string;
  kind: AfkJobKind;
  status: "completed" | "failed" | "cancelled";
  ticks: number;
  durationMs: number;
  gains: GainAccum;
  reason?: string;
}

export function buildReport(job: AfkJobState, now: number): AfkReport {
  if (job.status === "running" || job.status === "paused") {
    throw new Error(`buildReport 仅用于终态作业，当前 ${job.status}`);
  }
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    ticks: job.tickCount,
    durationMs: now - job.startedAt,
    gains: { ...job.gains },
    reason: job.stopReason,
  };
}
