import { describe, expect, it } from "vitest";
import type { Move } from "@yjh/content";
import {
  ENABLE_SLOTS,
  EnableError,
  assertCanEnable,
  autoEnableMap,
  basicSkillIdForSlot,
  effectiveLevel,
  newlyUnlockedMoves,
  unlockedMoves,
  type SkillRaw,
} from "./enable.js";

function skill(overrides: Partial<SkillRaw> & { id: string }): SkillRaw {
  return {
    level: 0,
    kind: "basic",
    category: "force",
    enableSlots: [],
    ...overrides,
  };
}

describe("basicSkillIdForSlot", () => {
  it("命名约定：basic_${slot}", () => {
    expect(basicSkillIdForSlot("force")).toBe("basic_force");
    expect(basicSkillIdForSlot("sword")).toBe("basic_sword");
  });

  it("有定义时优先取 kind=basic 且 category===slot 的技能 id", () => {
    const defs = [
      skill({ id: "xuanmen_neigong", kind: "basic", category: "force" }),
      skill({ id: "basic_sword", kind: "basic", category: "sword" }),
    ];
    expect(basicSkillIdForSlot("force", defs)).toBe("xuanmen_neigong");
    expect(basicSkillIdForSlot("sword", defs)).toBe("basic_sword");
    // 无匹配定义时回退命名约定
    expect(basicSkillIdForSlot("blade", defs)).toBe("basic_blade");
  });
});

describe("effectiveLevel（floor(基本功/2) + 已激发特殊功原级）", () => {
  const skills = new Map<string, SkillRaw>([
    ["basic_force", skill({ id: "basic_force", level: 50, kind: "basic", category: "force" })],
    [
      "xuanmen_force",
      skill({
        id: "xuanmen_force",
        level: 30,
        kind: "special",
        category: "force",
        enableSlots: ["force"],
      }),
    ],
    [
      "beiming_force",
      skill({
        id: "beiming_force",
        level: 60,
        kind: "special",
        category: "force",
        enableSlots: ["force"],
      }),
    ],
  ]);

  it("无激发：只算 floor(基本功/2)", () => {
    expect(effectiveLevel("force", skills, {})).toBe(25); // floor(50/2)
  });

  it("已激发特殊功：floor(基本功/2) + 特殊功原级", () => {
    expect(effectiveLevel("force", skills, { force: "xuanmen_force" })).toBe(55); // 25+30
    expect(effectiveLevel("force", skills, { force: "beiming_force" })).toBe(85); // 25+60
  });

  it("未学技能的槎位有效等级为 0", () => {
    expect(effectiveLevel("sword", skills, {})).toBe(0);
  });

  it("Record 与 Map 两种入参形式等价", () => {
    const record = Object.fromEntries(skills);
    expect(effectiveLevel("force", record, { force: "xuanmen_force" })).toBe(
      effectiveLevel("force", skills, { force: "xuanmen_force" }),
    );
  });
});

describe("assertCanEnable", () => {
  const skills = new Map<string, SkillRaw>([
    [
      "xuanmen_sword",
      skill({
        id: "xuanmen_sword",
        level: 30,
        kind: "special",
        category: "sword",
        enableSlots: ["sword"],
      }),
    ],
    ["basic_force", skill({ id: "basic_force", level: 20, kind: "basic", category: "force" })],
    [
      "unlearned_special",
      skill({
        id: "unlearned_special",
        level: 0,
        kind: "special",
        category: "sword",
        enableSlots: ["sword"],
      }),
    ],
  ]);

  it("满足条件时不抛错", () => {
    expect(() => assertCanEnable("sword", "xuanmen_sword", skills)).not.toThrow();
  });

  it("未学（原级 0 或不存在）→ not_learned", () => {
    expect(() => assertCanEnable("sword", "unlearned_special", skills)).toThrow(EnableError);
    expect(() => assertCanEnable("sword", "ghost_skill", skills)).toThrow(EnableError);
    try {
      assertCanEnable("sword", "ghost_skill", skills);
    } catch (e) {
      expect((e as EnableError).code).toBe("not_learned");
    }
  });

  it("非特殊功（基本功）→ not_special", () => {
    try {
      assertCanEnable("force", "basic_force", skills);
      throw new Error("应抛出 EnableError");
    } catch (e) {
      expect(e).toBeInstanceOf(EnableError);
      expect((e as EnableError).code).toBe("not_special");
    }
  });

  it("槎位不在 enableSlots 内 → slot_not_allowed", () => {
    try {
      assertCanEnable("blade", "xuanmen_sword", skills);
      throw new Error("应抛出 EnableError");
    } catch (e) {
      expect(e).toBeInstanceOf(EnableError);
      expect((e as EnableError).code).toBe("slot_not_allowed");
    }
  });
});

describe("autoEnableMap", () => {
  it("每槎位挑原级最高的已学特殊功", () => {
    const skills = new Map<string, SkillRaw>([
      [
        "xuanmen_sword",
        skill({
          id: "xuanmen_sword",
          level: 30,
          kind: "special",
          category: "sword",
          enableSlots: ["sword"],
        }),
      ],
      [
        "beiming_sword",
        skill({
          id: "beiming_sword",
          level: 50,
          kind: "special",
          category: "sword",
          enableSlots: ["sword"],
        }),
      ],
      [
        "xuanmen_force",
        skill({
          id: "xuanmen_force",
          level: 20,
          kind: "special",
          category: "force",
          enableSlots: ["force"],
        }),
      ],
    ]);
    const map = autoEnableMap(skills);
    expect(map.sword).toBe("beiming_sword"); // 50 > 30
    expect(map.force).toBe("xuanmen_force");
    expect(map.parry).toBeUndefined(); // 无可用特殊功
  });

  it("同级按 id 字典序取最小（确定性）", () => {
    const skills = new Map<string, SkillRaw>([
      [
        "b_sword",
        skill({
          id: "b_sword",
          level: 30,
          kind: "special",
          category: "sword",
          enableSlots: ["sword"],
        }),
      ],
      [
        "a_sword",
        skill({
          id: "a_sword",
          level: 30,
          kind: "special",
          category: "sword",
          enableSlots: ["sword"],
        }),
      ],
    ]);
    expect(autoEnableMap(skills).sword).toBe("a_sword");
  });

  it("未学（原级 0）不入选", () => {
    const skills = new Map<string, SkillRaw>([
      [
        "xuanmen_sword",
        skill({
          id: "xuanmen_sword",
          level: 0,
          kind: "special",
          category: "sword",
          enableSlots: ["sword"],
        }),
      ],
    ]);
    expect(autoEnableMap(skills).sword).toBeUndefined();
  });

  it("覆盖全部槎位常量", () => {
    expect(ENABLE_SLOTS).toEqual(["force", "dodge", "parry", "unarmed", "sword", "blade"]);
  });
});

describe("unlockedMoves / newlyUnlockedMoves", () => {
  const move = (
    overrides: Partial<Move> & { id: string; skillId: string; minLevel: number },
  ): Move => ({
    name: "招式",
    damage: 0,
    force: 0,
    dodge: 0,
    description: "d",
    ...overrides,
  });
  const moves: Move[] = [
    move({ id: "m1", skillId: "xuanmen_sword", name: "式一", minLevel: 0 }),
    move({ id: "m2", skillId: "xuanmen_sword", name: "式二", minLevel: 20 }),
    move({ id: "m3", skillId: "xuanmen_sword", name: "式三", minLevel: 40 }),
    move({ id: "m4", skillId: "other_skill", name: "式四", minLevel: 0 }),
  ];

  it("unlockedMoves：按 skillId + minLevel ≤ newLevel 过滤", () => {
    expect(unlockedMoves("xuanmen_sword", 0, moves).map((m) => m.id)).toEqual(["m1"]);
    expect(unlockedMoves("xuanmen_sword", 20, moves).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(unlockedMoves("xuanmen_sword", 100, moves).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(unlockedMoves("other_skill", 0, moves).map((m) => m.id)).toEqual(["m4"]);
  });

  it("newlyUnlockedMoves：仅返回本次升级新解锁的招式", () => {
    expect(newlyUnlockedMoves("xuanmen_sword", 0, 19, moves)).toEqual([]);
    expect(newlyUnlockedMoves("xuanmen_sword", 0, 20, moves).map((m) => m.id)).toEqual(["m2"]);
    expect(newlyUnlockedMoves("xuanmen_sword", 20, 40, moves).map((m) => m.id)).toEqual(["m3"]);
    expect(newlyUnlockedMoves("xuanmen_sword", 0, 40, moves).map((m) => m.id)).toEqual([
      "m2",
      "m3",
    ]);
  });
});
