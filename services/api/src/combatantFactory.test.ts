import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { buildCharacterCombatant } from "./combatantFactory.js";

const CONTENT = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [],
  skills: [
    { id: "sword", name: "剑法", category: "weapon", maxLevel: 500, baseLevel: 0 },
    { id: "force", name: "内功", category: "force", maxLevel: 500, baseLevel: 0 },
  ],
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
};

describe("buildCharacterCombatant", () => {
  it("PVP 满状态与 PVE 当前资源共享同一属性公式", () => {
    const skills = new Map([
      ["sword", 8],
      ["force", 6],
    ]);
    const full = buildCharacterCombatant(CONTENT, CHARACTER, skills);
    const current = buildCharacterCombatant(CONTENT, CHARACTER, skills, "current");
    expect(full).toMatchObject({ qi: full.maxQi, jing: full.maxJing, neili: full.maxNeili });
    expect(current).toMatchObject({ qi: 30, jing: 40, neili: 50 });
    expect(current.stats).toEqual(full.stats);
    expect(full.stats).toMatchObject({ weaponLevel: 8, forceLevel: 6, attack: 46 });
  });
});
