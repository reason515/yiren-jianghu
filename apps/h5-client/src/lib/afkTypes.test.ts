import { describe, expect, it, vi } from "vitest";
import { toAfkQuestOptions, toAfkSkillOptions, toAfkStatusView } from "./afkTypes.js";

describe("挂机数据适配", () => {
  it("将人物武功缩减为可供参悟的选择项", () => {
    expect(
      toAfkSkillOptions([
        {
          id: "basic_sword",
          name: "基础剑法",
          category: "weapon",
          level: 8,
          maxLevel: 100,
          practicePoints: 0,
        },
      ]),
    ).toEqual([{ id: "basic_sword", name: "基础剑法", level: 8 }]);
  });

  it("运行中只展示面向玩家的行止与预计时间，不暴露内部 phase", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    const view = toAfkStatusView({
      id: "job_1",
      kind: "study",
      status: "running",
      phase: "init",
      startedAt: "2026-08-07T00:00:00.000Z",
      scheduledEndAt: "2026-08-07T02:00:00.000Z",
      gains: { exp: 0, potential: 0, silver: 0 },
      config: { skillId: "basic_sword" },
    });
    expect(view).toEqual({ active: true, message: "静心参悟 · 约余 2 时辰" });
    vi.useRealTimers();
  });

  it("无作业是正常空态", () => {
    expect(toAfkStatusView({ active: false })).toEqual({ active: false, message: "" });
  });

  it("行侠选项只含已接且当前为击杀相位的差事", () => {
    const options = toAfkQuestOptions([
      {
        id: "q_hunt",
        name: "缉拿匪首",
        kind: "bounty",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "accepted",
        phases: [{ type: "kill", targetName: "劫道匪徒", done: false }],
      },
      {
        id: "q_talk",
        name: "拜会",
        kind: "main",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "accepted",
        phases: [{ type: "talk", targetName: "村长", done: false }],
      },
      {
        id: "q_done",
        name: "旧差事",
        kind: "bounty",
        briefing: "",
        rewards: { exp: 0, potential: 0, silver: 0 },
        state: "completed",
        phases: [{ type: "kill", targetName: "野狗", done: true }],
      },
    ]);
    expect(options).toEqual([{ id: "q_hunt", name: "缉拿匪首", targetName: "劫道匪徒" }]);
  });
});
