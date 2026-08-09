import { describe, expect, it } from "vitest";
import { compileExpr, evalExpr, ExprError } from "./expr.js";
import { compileMechanics, evalFormula, evalPiecewise } from "./mechanics.js";
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

describe("mechanics fixture", () => {
  it("compiles pack mechanics.yaml", () => {
    const m = defaultCompiledMechanics();
    expect(m.formulas.has("expForNextLevel")).toBe(true);
    expect(evalFormula(m, "expForNextLevel", { level: 1 })).toBe(100);
    // level^3 / 10 → 1000/10 = 100
    expect(evalFormula(m, "expGateRequired", { level: 10 })).toBeCloseTo(100, 5);
  });

  it("skillPower piecewise matches legacy segments", () => {
    const m = defaultCompiledMechanics();
    expect(evalPiecewise(m, "levelCubePower", { level: 10 })).toBe(Math.floor((10 * 10 * 10) / 30));
    expect(evalPiecewise(m, "levelCubePower", { level: 50 })).toBe(
      900 + Math.floor(Math.floor(50 / 10) ** 3 / 3),
    );
    // expK=5 < 30 → floor(combatExp/100)
    const combatExp = 5000;
    const expK = Math.floor(combatExp / 1000);
    expect(evalPiecewise(m, "combatExpBonus", { combatExp, expK })).toBe(
      Math.floor(combatExp / 100),
    );
    // 第二段：expK=50
    const combatExp2 = 50_000;
    const expK2 = Math.floor(combatExp2 / 1000);
    expect(evalPiecewise(m, "combatExpBonus", { combatExp: combatExp2, expK: expK2 })).toBe(
      270 + Math.floor(combatExp2 / 1000),
    );
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
