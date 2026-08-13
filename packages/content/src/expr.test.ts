import { describe, expect, it } from "vitest";
import { compileExpr, evalExpr, ExprError } from "./expr.js";
import { compileMechanics, evalFormula } from "./mechanics.js";
import { defaultCompiledMechanics } from "./defaultMechanics.js";

describe("expr", () => {
  it("evaluates arithmetic and functions", () => {
    expect(evalExpr("floor(3.7) + ceil(1.1)", {})).toBe(5);
    expect(evalExpr("max(1, min(5, 3))", {})).toBe(3);
    expect(evalExpr("round(2.5)", {})).toBe(3);
    expect(evalExpr("2^3", {})).toBe(8);
  });

  it("supports ternary and comparisons", () => {
    expect(evalExpr("1 < 2 ? 10 : 20", {})).toBe(10);
    expect(evalExpr("level <= 0 ? 1 : 2", { level: 0 })).toBe(1);
  });

  it("rejects unknown functions and variables", () => {
    expect(() => compileExpr("eval(1)")).toThrow(ExprError);
    expect(() => evalExpr("foo + 1", {})).toThrow(/未知变量/);
  });
});

describe("mechanics fixture（小数值）", () => {
  it("compiles pack mechanics.yaml", () => {
    const m = defaultCompiledMechanics();
    expect(m.formulas.has("expForNextLevel")).toBe(true);
    expect(evalFormula(m, "expForNextLevel", { level: 1 })).toBe(100);
    // DC-055：目标等级 ≤1 豁免；其余 level^2 / 0.5
    expect(evalFormula(m, "expGateRequired", { level: 1 })).toBe(0);
    expect(evalFormula(m, "expGateRequired", { level: 10 })).toBeCloseTo(200, 5);
    expect(evalFormula(m, "expGateRequired", { level: 50 })).toBeCloseTo(5000, 5);
  });

  it("skillPower 压缩：同属性下约等于等级", () => {
    const m = defaultCompiledMechanics();
    const weighted = 20 * m.coeffs.skillPower.strWeight + 10; // 110
    const power = 50;
    const got = evalFormula(m, "skillPowerWeighted", { power, weighted });
    expect(got).toBe(Math.floor((50 * 110) / (6 * 20))); // 45
  });

  it("rejects incomplete mechanics", () => {
    const r = compileMechanics({
      coeffs: defaultCompiledMechanics().coeffs,
      formulas: { expForNextLevel: "1" },
      piecewise: {},
    });
    expect(r.ok).toBe(false);
  });
});
