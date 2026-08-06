import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import {
  advanceQuestPhase,
  buildReport,
  cancelJob,
  createJob,
  dayKey,
  enterRest,
  isExpired,
  pauseJob,
  processTick,
  resumeJob,
  settleTick,
  type AfkJobState,
} from "./afk.js";

const T0 = Date.UTC(2026, 7, 6, 0, 0, 0); // 2026-08-06 00:00 UTC
const HOUR = 3_600_000;

const GAIN = { exp: 100, potential: 10, silver: 20 };

function job(): AfkJobState {
  return createJob({
    id: "job_1",
    characterId: "char_1",
    kind: "quest",
    now: T0,
    params: DEFAULT_PARAMS,
  });
}

function baseJob(): AfkJobState {
  return { ...job() };
}

describe("createJob", () => {
  it("scheduledEndAt = startedAt + maxDurationHours（8h），day 与小时归零", () => {
    const j = job();
    expect(j.status).toBe("running");
    expect(j.phase).toBe("init");
    expect(j.scheduledEndAt).toBe(T0 + 8 * HOUR);
    expect(j.day).toBe(dayKey(T0));
    expect(j.hoursToday).toBe(0);
    expect(j.gains).toEqual({ exp: 0, potential: 0, silver: 0 });
  });
});

describe("settleTick / 收益结算", () => {
  it("首个周期内无递减：2 小时 = 收益 × 2", () => {
    const { job: j, gained } = settleTick({
      job: baseJob(),
      params: DEFAULT_PARAMS,
      now: T0 + 2 * HOUR,
      deltaHours: 2,
      hourlyGain: GAIN,
    });
    expect(gained).toEqual({ exp: 200, potential: 20, silver: 40 });
    expect(j.hoursToday).toBe(2);
    expect(j.tickCount).toBe(1);
  });

  it("跨满周期递减：8h 后乘 0.5（dailyDiminishRate=0.5）", () => {
    const first = settleTick({
      job: baseJob(),
      params: DEFAULT_PARAMS,
      now: T0 + 6 * HOUR,
      deltaHours: 6,
      hourlyGain: GAIN,
    });
    const second = settleTick({
      job: first.job,
      params: DEFAULT_PARAMS,
      now: T0 + 10 * HOUR,
      deltaHours: 4, // 6 + 4 = 10h → 满 1 个 8h 周期 → 乘 0.5
      hourlyGain: GAIN,
    });
    expect(second.gained.exp).toBeCloseTo(100 * 4 * 0.5, 5);
    expect(second.job.gains.exp).toBeCloseTo(100 * 6 + 100 * 4 * 0.5, 5);
  });

  it("跨天重置 hoursToday（递减归零）", () => {
    const j = baseJob();
    const { job: nextDay } = settleTick({
      job: { ...j, day: "2026-08-06", hoursToday: 7 },
      params: DEFAULT_PARAMS,
      now: T0 + 25 * HOUR, // 次日 01:00
      deltaHours: 1,
      hourlyGain: GAIN,
    });
    expect(nextDay.day).toBe("2026-08-07");
    expect(nextDay.hoursToday).toBe(1);
  });
});

describe("processTick（到期/失败）", () => {
  it("未到期 → running", () => {
    const r = processTick({
      job: baseJob(),
      params: DEFAULT_PARAMS,
      now: T0 + HOUR,
      deltaHours: 1,
      hourlyGain: GAIN,
    });
    expect(r.status).toBe("running");
  });

  it("到达 scheduledEndAt → completed（时长上限）", () => {
    const r = processTick({
      job: { ...baseJob(), hoursToday: 7.9 },
      params: DEFAULT_PARAMS,
      now: T0 + 9 * HOUR,
      deltaHours: 0.1, // 8.0h
      hourlyGain: GAIN,
    });
    expect(r.status).toBe("completed");
    if (r.status === "completed") {
      expect(r.job.stopReason).toBe("时长上限");
      expect(r.job.gains.exp).toBeGreaterThan(0);
    }
  });

  it("业务失败（failure 非空）→ failed，立即终态且无收益", () => {
    const r = processTick({
      job: baseJob(),
      params: DEFAULT_PARAMS,
      now: T0 + HOUR,
      deltaHours: 1,
      hourlyGain: GAIN,
      failure: "目标房间不可达",
    });
    expect(r.status).toBe("failed");
    if (r.status === "failed") {
      expect(r.job.stopReason).toBe("目标房间不可达");
      expect(r.gained.exp).toBe(0);
    }
  });
});

describe("暂停/恢复/取消", () => {
  it("暂停顺延结束时间，不惩罚玩家", () => {
    const paused = pauseJob({ ...baseJob(), lastTickAt: T0 + 2 * HOUR }, T0 + 2 * HOUR, "维护");
    expect(paused.status).toBe("paused");
    const resumed = resumeJob(paused, 30 * 60_000, T0 + 2.5 * HOUR); // 暂停 30 分钟
    expect(resumed.status).toBe("running");
    expect(resumed.scheduledEndAt).toBe(T0 + 8 * HOUR + 30 * 60_000);
  });

  it("取消 → cancelled + 战报", () => {
    const cancelled = cancelJob({ ...baseJob(), tickCount: 3 }, T0 + 3 * HOUR, "手动停止");
    expect(cancelled.status).toBe("cancelled");
    const report = buildReport(cancelled, T0 + 3 * HOUR);
    expect(report.status).toBe("cancelled");
    expect(report.ticks).toBe(3);
    expect(report.reason).toBe("手动停止");
  });
});

describe("任务型挂机相位", () => {
  it("四相推进：accept→travel→fight→report→done", () => {
    expect(advanceQuestPhase("accept", "task_accepted")).toBe("travel");
    expect(advanceQuestPhase("travel", "arrived")).toBe("fight");
    expect(advanceQuestPhase("fight", "target_killed")).toBe("report");
    expect(advanceQuestPhase("report", "rewarded")).toBe("done");
  });

  it("事件不匹配不跳转；低血进 rest，恢复回 travel", () => {
    expect(advanceQuestPhase("accept", "arrived")).toBe("accept");
    expect(enterRest("fight")).toBe("rest");
    expect(advanceQuestPhase("rest", "recovered")).toBe("travel");
  });
});

describe("buildReport / isExpired", () => {
  it("终态才有战报；运行中抛错", () => {
    expect(() => buildReport(baseJob(), T0)).toThrow();
  });

  it("isExpired 边界", () => {
    const j = baseJob();
    expect(isExpired(j, T0 + 8 * HOUR - 1)).toBe(false);
    expect(isExpired(j, T0 + 8 * HOUR)).toBe(true);
  });
});
