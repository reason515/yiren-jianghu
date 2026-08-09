import { describe, expect, it } from "vitest";
import { validateContentPack } from "./validate.js";
import { contentPackSchema, type ContentPack } from "./schema.js";

function basePack(): ContentPack {
  return contentPackSchema.parse({
    manifest: { version: "0.1.0", name: "test-pack" },
    params: {
      expCurve: { base: 100, growth: 1.1 },
      potential: { learnCostFactor: 1 },
      combat: {
        baseHitRate: 0.7,
        baseDodgeRate: 0.1,
        baseParryRate: 0.15,
        hitPerAttackDiff: 0.01,
        dodgePerDodgeDiff: 0.01,
        parryPerParryDiff: 0.01,
        weaponDmgPerLevel: 0.5,
        forceDmgPerLevel: 0.4,
        defenseReduce: 0.5,
        damageVariance: 0.1,
        recoverNeiliPerTurn: 20,
        fleeBaseChance: 0.7,
      },
      afk: { maxDurationHours: 8, dailyDiminishRate: 0.5, studyAttemptsPerHour: 12 },
      vitals: {
        qiBase: 100,
        jingBase: 100,
        jingliBase: 100,
        qiPerCon: 16,
        qiPerStr: 0,
        jingPerInt: 16,
        forceQiPerLevel: 2,
        forceJingPerLevel: 1,
        neiliPerLevel: 10,
        jingliPerLevel: 3,
        neiliToQiDiv: 4,
        neiliToJingDiv: 12,
        foodBase: 200,
        foodPerCon: 10,
        waterBase: 200,
        waterPerDex: 10,
      },
      growth: {
        learnJingCostBase: 150,
        learnTuitionBase: 2,
        potentialCostPerLevel: 1,
        expGateExponent: 3,
        expGateDivisor: 10,
        practiceQiBase: 20,
        practiceQiPerLevel: 1,
        practicePointsPerAction: 1,
        studyJingBase: 80,
      },
      pvp: { dailyChallengeLimit: 5, kFactor: 32, seasonWeeks: 6 },
      economy: { silverDropBase: 5, maxCashflowPerDay: 1000 },
    },
    rooms: [
      {
        id: "village_square",
        area: "newbie",
        name: "村口广场",
        exits: [{ dir: "south", roomId: "village_inn" }],
      },
      {
        id: "village_inn",
        area: "newbie",
        name: "村中客栈",
        exits: [{ dir: "north", roomId: "village_square" }],
      },
    ],
    npcs: [
      {
        id: "village_guard",
        name: "村口守卫",
        kind: "battle",
        skills: [{ skillId: "basic_sword", level: 10 }],
        drops: [{ itemId: "iron_sword", chance: 0.2 }],
        battleRewards: { exp: 10, potential: 3, silver: 2 },
      },
    ],
    items: [{ id: "iron_sword", name: "铁剑", kind: "weapon", stats: { attack: 5 } }],
    skills: [
      {
        id: "basic_sword",
        name: "基本剑法",
        kind: "basic",
        category: "sword",
        enableSlots: [],
      },
    ],
    moves: [],
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

  it("warns on one-way exits without a return path", () => {
    const pack = basePack();
    pack.rooms[1] = { ...pack.rooms[1]!, exits: [] };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "one_way_exit")).toBe(true);
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

  it("flags broken vendor goods reference", () => {
    const pack = basePack();
    pack.npcs[0] = { ...pack.npcs[0]!, goods: [{ itemId: "ghost_good", buy: 10, sell: 5 }] };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "broken_goods_ref")).toBe(true);
  });

  it("warns when sell price exceeds buy price", () => {
    const pack = basePack();
    pack.npcs[0] = { ...pack.npcs[0]!, goods: [{ itemId: "iron_sword", buy: 10, sell: 20 }] };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "goods_price_inverted")).toBe(true);
  });

  it("flags world map unknown area and broken road", () => {
    const pack = basePack();
    pack.worldMap = {
      nodes: [
        {
          id: "ghost_land",
          name: "虚空",
          kind: "landmark",
          geo: [0, 0],
          scale: "landmark",
        },
        {
          id: "newbie",
          name: "青石村",
          kind: "village",
          geo: [1, 1],
          scale: "village",
        },
      ],
      roads: [{ from: "newbie", to: "nowhere", mode: "road" }],
    };
    const issues = validateContentPack(pack);
    expect(issues.some((i) => i.code === "world_unknown_area")).toBe(true);
    expect(issues.some((i) => i.code === "broken_world_road")).toBe(true);
  });
});
