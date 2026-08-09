import { describe, expect, it } from "vitest";
import { skillPower } from "./skillPower.js";

/**
 * 固定表值核对（对照 pkuxkx include/combat/probable.h 的等级立方/战斗经验分段，
 * attrs = { str: 20, dex: 10 } 便于区分 attack 与 defense 两种权重）。
 */
const ATTRS = { str: 20, dex: 10 };

describe("skillPower（DC-041：等级立方 + 战斗经验分段）", () => {
  it("level=0：无等级时按 combatExp/50 折算基础战力（下限 power=1）", () => {
    expect(skillPower(0, 0, ATTRS, "attack")).toBe(18);
    expect(skillPower(0, 0, ATTRS, "defense")).toBe(11);
    expect(skillPower(0, 30000, ATTRS, "attack")).toBe(11000);
    expect(skillPower(0, 30000, ATTRS, "defense")).toBe(7000);
  });

  it("level=29（<30 段，立方公式）", () => {
    expect(skillPower(29, 0, ATTRS, "attack")).toBe(14886);
    expect(skillPower(29, 0, ATTRS, "defense")).toBe(9473);
    expect(skillPower(29, 30000, ATTRS, "attack")).toBe(20386);
    expect(skillPower(29, 30000, ATTRS, "defense")).toBe(12973);
  });

  it("level=30（跨入 30–300 段）", () => {
    expect(skillPower(30, 0, ATTRS, "attack")).toBe(16665);
    expect(skillPower(30, 0, ATTRS, "defense")).toBe(10605);
    expect(skillPower(30, 30000, ATTRS, "attack")).toBe(22165);
    expect(skillPower(30, 30000, ATTRS, "defense")).toBe(14105);
  });

  it("level=300（跨入 300–600 段）", () => {
    expect(skillPower(300, 0, ATTRS, "attack")).toBe(184543);
    expect(skillPower(300, 0, ATTRS, "defense")).toBe(117436);
    expect(skillPower(300, 30000, ATTRS, "attack")).toBe(190043);
    expect(skillPower(300, 30000, ATTRS, "defense")).toBe(120936);
  });

  it("单调性：同经验下等级越高战力越高；同等级下经验越高战力越高", () => {
    const byLevel = [0, 29, 30, 300, 600, 1200, 1800, 3000, 5000].map((level) =>
      skillPower(level, 0, ATTRS, "attack"),
    );
    for (let i = 1; i < byLevel.length; i++) {
      expect(byLevel[i]).toBeGreaterThanOrEqual(byLevel[i - 1]!);
    }
    const byExp = [0, 1000, 30000, 3_000_000, 21_000_000, 180_000_000, 600_000_000].map((exp) =>
      skillPower(50, exp, ATTRS, "attack"),
    );
    for (let i = 1; i < byExp.length; i++) {
      expect(byExp[i]).toBeGreaterThanOrEqual(byExp[i - 1]!);
    }
  });

  it("attack 权重 (str*5+dex)/6，defense 权重 (dex*5+str)/6：str>dex 时 attack > defense", () => {
    expect(skillPower(100, 0, ATTRS, "attack")).toBeGreaterThan(
      skillPower(100, 0, ATTRS, "defense"),
    );
  });

  it("power 下限 1（避免 0 战力段）；但 attrs 全 0 时最终结果仍为 0", () => {
    expect(skillPower(0, 0, { str: 0, dex: 0 }, "attack")).toBe(0);
    expect(skillPower(1, 0, { str: 10, dex: 0 }, "attack")).toBeGreaterThan(0);
  });
});
