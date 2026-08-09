import { describe, expect, it } from "vitest";
import type { AfkJobState, GameParams } from "@yjh/game-core";
import { settleGrind } from "./grindSettlement.js";

const PARAMS = {
  afk: { maxDurationHours: 8, dailyDiminishRate: 0.5, studyAttemptsPerHour: 12 },
} as unknown as GameParams;

function job(overrides: Partial<AfkJobState> = {}): AfkJobState {
  const now = 1_000_000;
  return {
    id: "j1",
    characterId: "c1",
    kind: "grind",
    status: "running",
    phase: "work",
    startedAt: now,
    lastTickAt: now,
    scheduledEndAt: now + 8 * 3_600_000,
    day: "2026-08-09",
    hoursToday: 0,
    tickCount: 0,
    gains: { exp: 0, potential: 0, silver: 0 },
    ...overrides,
  };
}

describe("settleGrind", () => {
  it("按时长发放三件套并耗精", () => {
    const now = 1_000_000 + 3_600_000;
    const r = settleGrind({
      params: PARAMS,
      job: job(),
      now,
      deltaHours: 1,
      jing: 100,
      hourlyGain: { exp: 36, potential: 18, silver: 8 },
      jingPerHour: 12,
      maxExp: 2000,
      characterExp: 0,
    });
    expect(r.jingSpent).toBe(12);
    expect(r.outcome.gained).toEqual({ exp: 36, potential: 18, silver: 8 });
    expect(r.outcome.status).toBe("running");
    expect(r.exhausted).toBe(false);
  });

  it("精不足时按可做时长结算后失败停工", () => {
    const now = 1_000_000 + 3_600_000;
    const r = settleGrind({
      params: PARAMS,
      job: job(),
      now,
      deltaHours: 1,
      jing: 6,
      hourlyGain: { exp: 36, potential: 18, silver: 8 },
      jingPerHour: 12,
      maxExp: 2000,
      characterExp: 0,
    });
    expect(r.jingSpent).toBe(6);
    expect(r.outcome.gained.exp).toBeCloseTo(18);
    expect(r.outcome.status).toBe("failed");
    expect(r.exhausted).toBe(true);
  });

  it("历练已达上限则直接失败无收益", () => {
    const r = settleGrind({
      params: PARAMS,
      job: job(),
      now: 1_000_000,
      deltaHours: 1,
      jing: 100,
      hourlyGain: { exp: 36, potential: 18, silver: 8 },
      jingPerHour: 12,
      maxExp: 2000,
      characterExp: 2000,
    });
    expect(r.jingSpent).toBe(0);
    expect(r.outcome.gained).toEqual({ exp: 0, potential: 0, silver: 0 });
    expect(r.outcome.status).toBe("failed");
  });
});
