import { describe, expect, it } from "vitest";
import type { Move } from "@yjh/content";
import { pickMove } from "./movePick.js";
import { createSeededRng } from "./random.js";

function move(overrides: Partial<Move> & { id: string; skillId: string }): Move {
  return {
    name: "招式",
    minLevel: 0,
    damage: 0,
    force: 0,
    dodge: 0,
    description: "d",
    ...overrides,
  };
}

const MOVES: Move[] = [
  move({ id: "m1", skillId: "xuanmen_sword" }),
  move({ id: "m2", skillId: "xuanmen_sword" }),
  move({ id: "m3", skillId: "beiming_sword" }),
  move({ id: "m4", skillId: "unlearned_sword" }),
];

describe("pickMove（DC-041 普攻招式抽选）", () => {
  it("过滤：需已解锁 且 skillId 已激发；无候选返回 null", () => {
    expect(
      pickMove({
        moves: MOVES,
        learnedMoveIds: new Set(["m1", "m2", "m3"]),
        enabledSpecialIds: ["some_unrelated_skill"],
        rng: () => 0,
      }),
    ).toBeNull();

    expect(
      pickMove({
        moves: MOVES,
        learnedMoveIds: new Set(), // 未解锁任何招式
        enabledSpecialIds: ["xuanmen_sword", "beiming_sword"],
        rng: () => 0,
      }),
    ).toBeNull();
  });

  it("候选只包含已解锁 + 已激发技能的招式（m4 因所属技能未激发被排除）", () => {
    const picked = pickMove({
      moves: MOVES,
      learnedMoveIds: new Set(["m1", "m2", "m3", "m4"]),
      enabledSpecialIds: ["xuanmen_sword"],
      rng: () => 0,
    });
    expect(picked?.id).toBe("m1"); // rng=0 → 取候选首位
  });

  it("rng 覆盖候选全区间（确定性抽选）", () => {
    const opts = {
      moves: MOVES,
      learnedMoveIds: new Set(["m1", "m2"]),
      enabledSpecialIds: ["xuanmen_sword"],
    };
    expect(pickMove({ ...opts, rng: () => 0 })?.id).toBe("m1");
    expect(pickMove({ ...opts, rng: () => 0.99 })?.id).toBe("m2");
  });

  it("确定性：同 seed 同输入 → 同一抽选结果", () => {
    const opts = {
      moves: MOVES,
      learnedMoveIds: new Set(["m1", "m2", "m3"]),
      enabledSpecialIds: ["xuanmen_sword", "beiming_sword"],
    };
    const a = pickMove({ ...opts, rng: createSeededRng(42) });
    const b = pickMove({ ...opts, rng: createSeededRng(42) });
    expect(a).toEqual(b);
  });
});
