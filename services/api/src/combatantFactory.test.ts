import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { buildCharacterCombatant } from "./combatantFactory.js";

const CONTENT = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [{ id: "iron_sword", name: "铁剑", kind: "weapon" }],
  skills: [
    {
      id: "basic_sword",
      name: "基本剑法",
      kind: "basic",
      category: "sword",
      enableSlots: [],
      maxLevel: 200,
      baseLevel: 0,
    },
    {
      id: "basic_force",
      name: "基本内功",
      kind: "basic",
      category: "force",
      enableSlots: [],
      maxLevel: 200,
      baseLevel: 0,
    },
    {
      id: "xuanmen_sword",
      name: "玄门剑法",
      kind: "special",
      category: "sword",
      enableSlots: ["sword", "parry"],
      maxLevel: 300,
      baseLevel: 0,
    },
    {
      id: "xuanmen_force",
      name: "玄门心法",
      kind: "special",
      category: "force",
      enableSlots: ["force"],
      maxLevel: 300,
      baseLevel: 0,
    },
  ],
  moves: [],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

const CHARACTER = {
  id: "char_1",
  name: "沈青锋",
  attrs: { str: 20, int: 15, con: 18, dex: 12 },
  qi: 30,
  jing: 40,
  neili: 50,
  exp: 1000,
};

describe("buildCharacterCombatant", () => {
  it("PVP 满状态与 PVE 当前资源共享同一属性公式（DC-041 有效等级）", () => {
    const skills = new Map([
      ["basic_sword", 20],
      ["basic_force", 10],
      ["xuanmen_sword", 40],
      ["xuanmen_force", 20],
    ]);
    const enable = { sword: "xuanmen_sword", force: "xuanmen_force" };
    const full = buildCharacterCombatant(CONTENT, CHARACTER, skills, "full", enable, true);
    const current = buildCharacterCombatant(CONTENT, CHARACTER, skills, "current", enable, true);
    expect(full).toMatchObject({ qi: full.maxQi, jing: full.maxJing, neili: full.maxNeili });
    expect(current).toMatchObject({ qi: 30, jing: 40, neili: 50 });
    expect(current.stats).toEqual(full.stats);
    // effective sword = floor(20/2)+40 = 50; force = floor(10/2)+20 = 25
    expect(full.stats).toMatchObject({ weaponLevel: 50, forceLevel: 25, attack: 70 });
  });
});
