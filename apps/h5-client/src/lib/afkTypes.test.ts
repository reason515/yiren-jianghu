import { describe, expect, it, vi } from "vitest";
import { toAfkQuestOptions, toAfkSkillOptions, toAfkStatusView } from "./afkTypes.js";

describe("挂机数据适配", () => {
  it("将人物武功缩减为可供参悟的选择项", () => {
    expect(
      toAfkSkillOptions([
        {
          id: "basic_sword",
          name: "基础剑法",
          category: "sword",
          kind: "basic",
          enableSlots: [],
          level: 8,
          maxLevel: 100,
          practicePoints: 0,
        },
      ]),
    ).toEqual([{ id: "basic_sword", name: "基础剑法", level: 8 }]);
  });

  it("运行中只展示面向玩家的挂机状态与预计时间，不暴露内部 phase", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    const view = toAfkStatusView({
      id: "job_1",
      kind: "practice",
      presence: "offline",
      status: "running",
      phase: "init",
      startedAt: "2026-08-07T00:00:00.000Z",
      scheduledEndAt: "2026-08-07T02:00:00.000Z",
      gains: { exp: 0, potential: 0, silver: 0 },
      progress: 0,
      elapsedMs: 0,
      totalMs: 7_200_000,
      journalLines: [],
      config: { skillId: "basic_sword" },
    });
    expect(view).toMatchObject({
      active: true,
      paused: false,
      message: "离线练功途中 · 约余 1 时辰",
      progress: 0,
    });
    vi.useRealTimers();
  });

  it("暂停态展示断线原因", () => {
    const view = toAfkStatusView({
      id: "job_1",
      kind: "grind",
      presence: "online",
      status: "paused",
      phase: "work",
      startedAt: "2026-08-07T00:00:00.000Z",
      scheduledEndAt: "2026-08-07T01:00:00.000Z",
      stopReason: "气息中断，挂机暂歇",
      gains: { exp: 10, potential: 5, silver: 2 },
      progress: 0.3,
      elapsedMs: 1_000_000,
      totalMs: 3_600_000,
      journalLines: [],
      config: { jobId: "village_chore" },
    });
    expect(view).toMatchObject({
      active: true,
      paused: true,
      message: "气息中断，挂机暂歇",
      progress: 0.3,
      gains: { exp: 10, potential: 5, silver: 2 },
    });
  });

  it("无作业是正常空态", () => {
    expect(toAfkStatusView({ active: false })).toEqual({
      active: false,
      paused: false,
      message: "",
      progress: 0,
      gains: { exp: 0, potential: 0, silver: 0 },
      journalLines: [],
      openEnded: false,
      lockExits: false,
    });
  });

  it("在线生计 running 锁出口并展示巡回阶段", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    const view = toAfkStatusView({
      id: "job_1",
      kind: "grind",
      presence: "online",
      status: "running",
      phase: "circuit",
      grindPhase: "circuit",
      rounds: 1,
      roomId: "village_general",
      startedAt: "2026-08-07T00:00:00.000Z",
      scheduledEndAt: "2026-08-07T00:30:00.000Z",
      gains: { exp: 4, potential: 2, silver: 1 },
      progress: 0.2,
      elapsedMs: 360_000,
      totalMs: 1_800_000,
      journalLines: [],
      config: { jobId: "village_fish", phase: "circuit", rounds: 1 },
    });
    expect(view).toMatchObject({
      active: true,
      lockExits: true,
      message: "在线生计途中 · 第 2 圈 · 约余 0.3 时辰",
      roomId: "village_general",
      rounds: 1,
    });
    vi.useRealTimers();
  });

  it("无结束时间的在线生计不显示倒计时", () => {
    const view = toAfkStatusView({
      id: "job_open",
      kind: "grind",
      presence: "online",
      status: "running",
      phase: "circuit",
      grindPhase: "circuit",
      startedAt: "2026-08-07T00:00:00.000Z",
      scheduledEndAt: null,
      gains: { exp: 0, potential: 0, silver: 0 },
      progress: 0,
      elapsedMs: 0,
      totalMs: 0,
      journalLines: [],
      config: { jobId: "village_chore" },
    });
    expect(view.openEnded).toBe(true);
    expect(view.message).not.toContain("约余");
  });

  it("行侠选项只含已手动交差解锁、当前可重接的差事", () => {
    const options = toAfkQuestOptions([
      {
        id: "q_hunt",
        name: "缉拿匪首",
        kind: "bounty",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "available",
        autoUnlocked: true,
        phases: [{ type: "talk", targetName: "沈捕头", done: false }],
      },
      {
        id: "q_talk",
        name: "拜会",
        kind: "main",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "available",
        autoUnlocked: false,
        phases: [{ type: "talk", targetName: "村长", done: false }],
      },
      {
        id: "q_done",
        name: "旧差事",
        kind: "bounty",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "completed",
        autoUnlocked: true,
        phases: [{ type: "kill", targetName: "野狗", done: true }],
      },
    ]);
    expect(options).toEqual([
      {
        id: "q_hunt",
        name: "缉拿匪首",
        targetName: "沈捕头",
        roundGain: { exp: 0, potential: 0, silver: 0 },
      },
    ]);
  });
});
