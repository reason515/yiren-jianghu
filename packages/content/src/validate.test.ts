import { describe, expect, it } from "vitest";
import { validateContentPack } from "./validate.js";
import { contentPackSchema, type ContentPack } from "./schema.js";

function basePack(): ContentPack {
  return contentPackSchema.parse({
    manifest: { version: "0.1.0", name: "test-pack" },
    params: {
      expCurve: { base: 100, growth: 1.1 },
      potential: { learnCostFactor: 1 },
      combat: { baseHitRate: 0.7, baseDodgeRate: 0.1, baseParryRate: 0.15 },
      afk: { maxDurationHours: 8, dailyDiminishRate: 0.5 },
      economy: { silverDropBase: 5, maxCashflowPerDay: 1000 },
    },
    rooms: [
      {
        id: "village_square",
        area: "newbie",
        name: "村口广场",
        exits: [{ dir: "south", roomId: "village_inn" }],
      },
      { id: "village_inn", area: "newbie", name: "村中客栈" },
    ],
    npcs: [
      {
        id: "village_guard",
        name: "村口守卫",
        kind: "battle",
        skills: [{ skillId: "basic_sword", level: 10 }],
        drops: [{ itemId: "iron_sword", chance: 0.2 }],
      },
    ],
    items: [{ id: "iron_sword", name: "铁剑", kind: "weapon", stats: { attack: 5 } }],
    skills: [{ id: "basic_sword", name: "基础剑法", category: "weapon" }],
    performs: [],
    quests: [
      {
        id: "q_clear_rats",
        name: "清理鼠患",
        kind: "bounty",
        phases: [{ type: "kill", targetId: "village_guard", count: 1 }],
        rewards: { exp: 50, silver: 10 },
      },
    ],
    story: [],
  });
}

describe("validateContentPack", () => {
  it("accepts a coherent pack", () => {
    expect(validateContentPack(basePack())).toEqual([]);
  });

  it("flags duplicate ids", () => {
    const pack = basePack();
    pack.rooms[1] = { ...pack.rooms[1]!, id: "village_square" };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "duplicate_id")).toBe(true);
  });

  it("flags broken exits", () => {
    const pack = basePack();
    pack.rooms[0] = { ...pack.rooms[0]!, exits: [{ dir: "north", roomId: "nowhere" }] };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "broken_exit")).toBe(true);
  });

  it("flags broken quest npc reference", () => {
    const pack = basePack();
    pack.quests[0] = {
      ...pack.quests[0]!,
      phases: [{ type: "kill", targetId: "ghost", count: 1 }],
    };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "broken_quest_npc")).toBe(true);
  });

  it("flags broken drop reference", () => {
    const pack = basePack();
    pack.npcs[0] = {
      ...pack.npcs[0]!,
      drops: [{ itemId: "ghost_item", chance: 0.5, min: 1, max: 1 }],
    };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "broken_drop_ref")).toBe(true);
  });
});
