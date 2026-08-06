import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  diminishMultiplier,
  effectivePotential,
  expForNextLevel,
  parseParams,
} from "./params.js";

describe("expForNextLevel", () => {
  it("matches base * growth^(level-1)", () => {
    expect(expForNextLevel(DEFAULT_PARAMS, 1)).toBe(100);
    expect(expForNextLevel(DEFAULT_PARAMS, 2)).toBe(110);
    expect(expForNextLevel(DEFAULT_PARAMS, 5)).toBe(Math.round(100 * 1.1 ** 4));
  });

  it("rejects invalid levels", () => {
    expect(() => expForNextLevel(DEFAULT_PARAMS, 0)).toThrow(RangeError);
    expect(() => expForNextLevel(DEFAULT_PARAMS, 1.5)).toThrow(RangeError);
  });
});

describe("effectivePotential", () => {
  it("subtracts learned points and clamps at zero", () => {
    expect(effectivePotential(104, 4)).toBe(100);
    expect(effectivePotential(10, 20)).toBe(0);
  });
});

describe("diminishMultiplier", () => {
  it("is 1 before any full duration cycle", () => {
    expect(diminishMultiplier(DEFAULT_PARAMS, 0)).toBe(1);
    expect(diminishMultiplier(DEFAULT_PARAMS, 7.9)).toBe(1);
  });

  it("decays per full cycle deterministically", () => {
    const p = DEFAULT_PARAMS; // maxDurationHours=8, dailyDiminishRate=0.5
    expect(diminishMultiplier(p, 8)).toBe(0.5);
    expect(diminishMultiplier(p, 16)).toBe(0.25);
    expect(diminishMultiplier(p, 80)).toBeCloseTo(0.5 ** 10);
  });

  it("is monotonic non-increasing", () => {
    let prev = 1;
    for (let h = 0; h <= 48; h += 0.5) {
      const m = diminishMultiplier(DEFAULT_PARAMS, h);
      expect(m).toBeLessThanOrEqual(prev + 1e-9);
      prev = m;
    }
  });

  it("rejects negative hours", () => {
    expect(() => diminishMultiplier(DEFAULT_PARAMS, -1)).toThrow(RangeError);
  });
});

describe("parseParams", () => {
  it("accepts a valid params object", () => {
    const r = parseParams(DEFAULT_PARAMS);
    expect(r.ok).toBe(true);
  });

  it("rejects out-of-range afk duration", () => {
    const r = parseParams({
      ...DEFAULT_PARAMS,
      afk: { ...DEFAULT_PARAMS.afk, maxDurationHours: 48 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("; ")).toContain("afk.maxDurationHours");
  });

  it("rejects non-numeric fields", () => {
    const r = parseParams({ ...DEFAULT_PARAMS, expCurve: { base: "x", growth: 1.1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("; ")).toContain("expCurve.base");
  });
});
