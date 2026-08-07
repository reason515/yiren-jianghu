import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { seedForQuestJob, settleQuestBattle } from "./questSettlement.js";

const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [
    {
      id: "wild_dog",
      name: "野狗",
      kind: "battle",
      level: 1,
      skills: [],
      drops: [{ itemId: "dry_food", chance: 1, min: 1, max: 1 }],
      battleRewards: { exp: 5, potential: 2, silver: 2 },
    },
  ],
  items: [],
  skills: [{ id: "basic_sword", name: "基础剑法", category: "weapon", maxLevel: 100 }],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

const INPUT = {
  content: PACK,
  jobId: "job_1",
  killIndex: 1,
  character: {
    id: "char_1",
    name: "试剑客",
    attrs: { str: 30, int: 20, con: 30, dex: 20 },
    qi: 580,
    jing: 420,
    neili: 200,
    exp: 0,
  },
  skillLevels: new Map([["basic_sword", 20]]),
  templateSnapshot: { version: 1, rules: [], defaultAction: { type: "attack" } },
  target: PACK.npcs[0]!,
};

describe("行侠挂机结算", () => {
  it("同一作业战斗与掉落种子固定", () => {
    expect(seedForQuestJob("job_1", 1, "battle")).toBe(seedForQuestJob("job_1", 1, "battle"));
    expect(seedForQuestJob("job_1", 1, "battle")).not.toBe(seedForQuestJob("job_1", 1, "drops"));
  });

  it("模板驱动自动战斗：同输入可复现，并回传终局资源与掉落", () => {
    const first = settleQuestBattle(INPUT);
    const second = settleQuestBattle(INPUT);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ won: true, drops: [{ itemId: "dry_food", count: 1 }] });
    expect(first.combatant.qi).toBeLessThanOrEqual(INPUT.character.qi);
  });

  it("残缺模板不进入战斗，明确失败原因", () => {
    const result = settleQuestBattle({ ...INPUT, templateSnapshot: { rules: "not-an-array" } });
    expect(result).toMatchObject({ won: false, reason: "invalid_template", turns: 0 });
  });
});
