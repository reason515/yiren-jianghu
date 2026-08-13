import { describe, expect, it } from "vitest";
import { attackOnly, DEFAULT_PARAMS, runBattle } from "@yjh/game-core";
import type { ContentPack, Npc } from "@yjh/content";
import { buildCharacterCombatant, buildNpcCombatant } from "./combatantFactory.js";

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

  it("新手佩剑 vs 弱野狗约数回合结束（DC-055）", () => {
    const pack = {
      ...CONTENT,
      items: [{ id: "iron_sword", name: "铁剑", kind: "weapon", stats: { attack: 5 } }],
      skills: [
        ...CONTENT.skills,
        {
          id: "basic_unarmed",
          name: "基本拳脚",
          kind: "basic",
          category: "unarmed",
          enableSlots: [],
          maxLevel: 100,
          baseLevel: 0,
        },
        {
          id: "basic_dodge",
          name: "基本轻功",
          kind: "basic",
          category: "dodge",
          enableSlots: [],
          maxLevel: 100,
          baseLevel: 0,
        },
      ],
    } as unknown as ContentPack;
    const npc = {
      id: "wild_dog",
      name: "野狗",
      kind: "battle" as const,
      level: 0,
      attrs: { str: 6, int: 4, con: 1, dex: 6 },
      skills: [
        { skillId: "basic_unarmed", level: 1 },
        { skillId: "basic_dodge", level: 1 },
      ],
      nature: "beast" as const,
      equipment: [],
      drops: [],
      battleRewards: { exp: 10, potential: 4, silver: 3 },
      battleAllies: [],
      aggressive: true,
      teaches: [],
      goods: [],
      dialogue: [],
      description: "",
      minExp: 0,
    } satisfies Partial<Npc> as Npc;
    const player = buildCharacterCombatant(
      pack,
      {
        id: "p",
        name: "青萍客",
        attrs: { str: 20, int: 20, con: 20, dex: 20 },
        exp: 0,
        equippedItemIds: ["iron_sword"],
      },
      new Map([["basic_sword", 1]]),
      "full",
      null,
      true,
    );
    const dog = buildNpcCombatant(pack, npc);
    const result = runBattle({
      a: player,
      b: dog,
      selectors: { a: attackOnly, b: attackOnly },
      seed: 42,
      params: DEFAULT_PARAMS,
      maxTurns: 20,
    });
    expect(result.winner).toBe("a");
    expect(result.turns).toBeGreaterThanOrEqual(1);
    // qiBase 地板 + DC-050 命中夹逼：新手有效等级 0 时约十余回合，不改全局公式
    expect(result.turns).toBeLessThanOrEqual(20);
    expect(dog.maxQi).toBeLessThanOrEqual(60);
  });
});
