import { describe, expect, it } from "vitest";
import { skillPower } from "./skillPower.js";

/**
 * 小数值 skill_power：基底≈有效等级，经 levelScale 压缩后约等于等级本身（同属性）。
 * attrs = { str: 20, dex: 10 } → attack weighted=110，defense=70；denom=6*20=120。
 */
const ATTRS = { str: 20, dex: 10 };

describe("skillPower（小数值：有效等级 × 属性权重）", () => {
  it("level=0：按 combatExp/zeroLevelExpDiv 折算并封顶 120", () => {
    expect(skillPower(0, 0, ATTRS, "attack")).toBe(1);
    expect(skillPower(0, 0, ATTRS, "defense")).toBe(1);
    // power=min(120, 600)=120 → attack floor(120*110/120)=110
    expect(skillPower(0, 30_000, ATTRS, "attack")).toBe(110);
    expect(skillPower(0, 30_000, ATTRS, "defense")).toBe(70);
  });

  it("有等级时战力落在百级内且约等于等级", () => {
    expect(skillPower(29, 0, ATTRS, "attack")).toBe(26);
    expect(skillPower(29, 0, ATTRS, "defense")).toBe(16);
    expect(skillPower(50, 0, ATTRS, "attack")).toBe(45);
    expect(skillPower(100, 0, ATTRS, "attack")).toBe(91);
    expect(skillPower(120, 0, ATTRS, "attack")).toBe(110);
  });

  it("单调性：同经验下等级越高战力越高；同等级下经验不再抬高等级战力", () => {
    const byLevel = [1, 10, 30, 50, 80, 100, 120].map((level) =>
      skillPower(level, 0, ATTRS, "attack"),
    );
    for (let i = 1; i < byLevel.length; i++) {
      expect(byLevel[i]).toBeGreaterThanOrEqual(byLevel[i - 1]!);
    }
    // 有等级后 combatExp 不进入基底
    expect(skillPower(50, 0, ATTRS, "attack")).toBe(skillPower(50, 999_999, ATTRS, "attack"));
  });

  it("attack 权重高于 defense（str>dex）", () => {
    expect(skillPower(100, 0, ATTRS, "attack")).toBeGreaterThan(
      skillPower(100, 0, ATTRS, "defense"),
    );
  });

  it("attrs 全 0 时最终至少为 minPower", () => {
    expect(skillPower(1, 0, { str: 0, dex: 0 }, "attack")).toBe(1);
  });
});
