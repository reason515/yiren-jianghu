import { describe, expect, it } from "vitest";
import { emptyCarry, splitApplied } from "./jobSettle.js";

describe("splitApplied（在线短 tick 整数落库）", () => {
  it("小数累计后按 floor 落库，余数保留在 carry", () => {
    const first = splitApplied(emptyCarry(), {
      exp: 1.08,
      potential: 0.54,
      silver: 0.24,
      jing: 0.2,
    });
    expect(first.applied).toEqual({ exp: 1, potential: 0, silver: 0, jing: 0 });
    expect(first.nextCarry.exp).toBeCloseTo(0.08);
    expect(first.nextCarry.potential).toBeCloseTo(0.54);

    const second = splitApplied(first.nextCarry, {
      exp: 1.08,
      potential: 0.54,
      silver: 0.24,
      jing: 0.2,
    });
    expect(second.applied).toEqual({ exp: 1, potential: 1, silver: 0, jing: 0 });
  });

  it("多轮后银两与耗精也会整段入账", () => {
    let carry = emptyCarry();
    let silver = 0;
    let jing = 0;
    for (let i = 0; i < 5; i += 1) {
      const step = splitApplied(carry, { exp: 0, potential: 0, silver: 0.24, jing: 0.2 });
      carry = step.nextCarry;
      silver += step.applied.silver;
      jing += step.applied.jing;
    }
    expect(silver).toBe(1);
    expect(jing).toBe(1);
  });
});
