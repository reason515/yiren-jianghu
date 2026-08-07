import { describe, expect, it } from "vitest";
import { toQuestPanelData, type QuestOverviewResponse } from "./questTypes.js";

const OVERVIEW: QuestOverviewResponse = {
  story: [{ id: "s_begin", title: "初入江湖", done: false, current: true }],
  quests: [
    {
      id: "q_newbie_trail",
      name: "初试身手",
      kind: "bounty",
      briefing: "村外有犬吠。",
      status: "ongoing",
      phases: [
        { type: "goto", targetName: "村外小径", targetRoomId: "village_trail", count: 1, done: 0 },
        { type: "kill", targetName: "野狗", count: 1, done: 0 },
      ],
      rewards: { exp: 30, potential: 8, silver: 5 },
    },
    {
      id: "q_locked",
      name: "未至之路",
      kind: "main",
      briefing: "",
      status: "locked",
      phases: [],
      rewards: { exp: 0, potential: 0, silver: 0 },
    },
  ],
};

describe("toQuestPanelData", () => {
  it("保留服务端足迹与目标名，并隐藏锁定任务", () => {
    const data = toQuestPanelData(OVERVIEW);
    expect(data.story).toEqual(OVERVIEW.story);
    expect(data.quests).toEqual([
      expect.objectContaining({ id: "q_newbie_trail", state: "accepted" }),
    ]);
    expect(data.quests[0]?.phases).toEqual([
      expect.objectContaining({
        type: "goto",
        targetName: "村外小径",
        targetRoomId: "village_trail",
      }),
      expect.objectContaining({ type: "kill", targetName: "野狗", progress: { cur: 0, need: 1 } }),
    ]);
  });
});
