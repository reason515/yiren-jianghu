import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import {
  clampEff,
  clampVitals,
  computeMaxVitals,
  maxFoodCapacity,
  maxWaterCapacity,
} from "./vitals.js";

/** 新手村毕业常规属性（先天 20）。 */
const FRESH: Parameters<typeof computeMaxVitals>[1] = {
  str: 20,
  int: 20,
  con: 20,
  dex: 20,
  forceLevel: 0,
};

describe("computeMaxVitals（属性表驱动矩阵）", () => {
  it("无内功新角色：动态上限由属性与基础值决定", () => {
    const m = computeMaxVitals(DEFAULT_PARAMS, FRESH);
    // maxQi = 100 + 20*16 = 420；maxJing 同理；maxNeili = 0；maxJingli = 100
    expect(m).toEqual({ maxQi: 420, maxJing: 420, maxNeili: 0, maxJingli: 100 });
  });

  it("内功等级提升：neili/qi/jing/jingli 同步增长", () => {
    const m = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 50 });
    // maxNeili = 50*10 = 500
    // maxQi = 420 + 50*2 + floor(500/4) = 420 + 100 + 125 = 645
    // maxJing = 420 + 50*1 + floor(500/12) = 420 + 50 + 41 = 511
    // maxJingli = 100 + 50*3 = 250
    expect(m).toEqual({ maxQi: 645, maxJing: 511, maxNeili: 500, maxJingli: 250 });
  });

  it("不同属性组合产生不同上限（验证 con/int 分别驱动 qi/jing）", () => {
    const tank = computeMaxVitals(DEFAULT_PARAMS, {
      str: 30,
      int: 10,
      con: 30,
      dex: 10,
      forceLevel: 0,
    });
    const scholar = computeMaxVitals(DEFAULT_PARAMS, {
      str: 10,
      int: 30,
      con: 10,
      dex: 30,
      forceLevel: 0,
    });
    expect(tank.maxQi).toBeGreaterThan(scholar.maxQi);
    expect(scholar.maxJing).toBeGreaterThan(tank.maxJing);
  });

  it("确定性：同输入同输出", () => {
    const a = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 33 });
    const b = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 33 });
    expect(a).toEqual(b);
  });

  it("参数表驱动：改系数影响结果（内容包可调）", () => {
    const custom = {
      ...DEFAULT_PARAMS,
      vitals: { ...DEFAULT_PARAMS.vitals, qiPerCon: 8, forceQiPerLevel: 0 },
    };
    const m = computeMaxVitals(custom, FRESH);
    expect(m.maxQi).toBe(100 + 20 * 8); // 260，不再是 420
  });
});

describe("食物/饮水上限", () => {
  it("按体质/身法线性增长", () => {
    expect(maxFoodCapacity(DEFAULT_PARAMS, 20)).toBe(400);
    expect(maxFoodCapacity(DEFAULT_PARAMS, 30)).toBe(500);
    expect(maxWaterCapacity(DEFAULT_PARAMS, 20)).toBe(400);
    expect(maxWaterCapacity(DEFAULT_PARAMS, 25)).toBe(450);
  });
});

describe("clampVitals / clampEff", () => {
  const max = computeMaxVitals(DEFAULT_PARAMS, FRESH);
  const caps = {
    foodCap: maxFoodCapacity(DEFAULT_PARAMS, 20),
    waterCap: maxWaterCapacity(DEFAULT_PARAMS, 20),
  };

  it("越界值钳制到合法区间", () => {
    const clamped = clampVitals(
      { qi: 9999, jing: -5, jingli: 50, neili: 30, food: 999, water: -1, effQi: 999, effJing: 0 },
      max,
      caps.foodCap,
      caps.waterCap,
    );
    expect(clamped.qi).toBe(max.maxQi);
    expect(clamped.jing).toBe(0);
    expect(clamped.food).toBe(caps.foodCap);
    expect(clamped.water).toBe(0);
    expect(clamped.effQi).toBe(max.maxQi);
    expect(clamped.effJing).toBe(0);
  });

  it("正常值保持原样", () => {
    const state = {
      qi: 200,
      jing: 200,
      jingli: 80,
      neili: 0,
      food: 300,
      water: 300,
      effQi: 400,
      effJing: 400,
    };
    expect(clampVitals(state, max, caps.foodCap, caps.waterCap)).toEqual(state);
  });

  it("clampEff 保证 eff ≤ max 且 ≥ 0", () => {
    expect(clampEff(150, 100)).toBe(100);
    expect(clampEff(-10, 100)).toBe(0);
    expect(clampEff(80, 100)).toBe(80);
  });
});
