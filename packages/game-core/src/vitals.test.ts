import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import {
  applyRegen,
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
    // 小数值：maxQi = 50 + 20*8 = 210；maxJing 同理；maxNeili = 0；maxJingli = 50
    expect(m).toEqual({ maxQi: 210, maxJing: 210, maxNeili: 0, maxJingli: 50 });
  });

  it("内功等级提升：neili/qi/jing/jingli 同步增长", () => {
    const m = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 50 });
    // maxNeili = 50*8 = 400
    // maxQi = 210 + 50*1 + floor(400/4) = 210 + 50 + 100 = 360
    // maxJing = 210 + 50*1 + floor(400/12) = 210 + 50 + 33 = 293
    // maxJingli = 50 + 50*2 = 150
    expect(m).toEqual({ maxQi: 360, maxJing: 293, maxNeili: 400, maxJingli: 150 });
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
      vitals: { ...DEFAULT_PARAMS.vitals, qiPerCon: 4, forceQiPerLevel: 0 },
    };
    const m = computeMaxVitals(custom, FRESH);
    expect(m.maxQi).toBe(50 + 20 * 4); // 130
  });
});

describe("食物/饮水上限", () => {
  it("按体质/身法线性增长", () => {
    expect(maxFoodCapacity(DEFAULT_PARAMS, 20)).toBe(200);
    expect(maxFoodCapacity(DEFAULT_PARAMS, 30)).toBe(250);
    expect(maxWaterCapacity(DEFAULT_PARAMS, 20)).toBe(200);
    expect(maxWaterCapacity(DEFAULT_PARAMS, 25)).toBe(225);
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

  it("正常值保持原样（在新上限内）", () => {
    const state = {
      qi: 200,
      jing: 200,
      jingli: 40,
      neili: 0,
      food: 180,
      water: 180,
      effQi: 200,
      effJing: 200,
    };
    expect(clampVitals(state, max, caps.foodCap, caps.waterCap)).toEqual(state);
  });

  it("clampEff 保证 eff ≤ max 且 ≥ 0", () => {
    expect(clampEff(150, 100)).toBe(100);
    expect(clampEff(-10, 100)).toBe(0);
    expect(clampEff(80, 100)).toBe(80);
  });
});

describe("applyRegen（V2.12 自然恢复，参照 pkuxkx 时间恢复）", () => {
  const MAX = { maxQi: 420, maxJing: 420, maxJingli: 100, maxNeili: 100 };
  const HURT: Parameters<typeof applyRegen>[0] = {
    qi: 0,
    jing: 0,
    jingli: 0,
    neili: 0,
    food: 300,
    water: 300,
    effQi: 0,
    effJing: 0,
  };

  it("按上限比例 + 时间差恢复，封顶上限；食水按绝对值消耗", () => {
    const next = applyRegen(HURT, MAX, 10, DEFAULT_PARAMS);
    // qi: floor(420 * 0.03 * 10) = 126；jing: floor(420*0.025*10) = 105；
    // jingli: floor(100*0.03*10) = 30；neili: floor(100*0.015*10) = 15
    expect(next).toMatchObject({ qi: 126, jing: 105, jingli: 30, neili: 15 });
    // food: 300 - floor(0.8*10) = 292；water: 300 - floor(1.2*10) = 288
    expect(next.food).toBe(292);
    expect(next.water).toBe(288);
  });

  it("恢复不超上限；时间差超窗口按窗口封顶（防离线累积）；食水不低于 0", () => {
    const nearlyFull = applyRegen(
      { ...HURT, qi: 400, jing: 400, jingli: 90, neili: 95 },
      MAX,
      10,
      DEFAULT_PARAMS,
    );
    expect(nearlyFull.qi).toBe(420);
    expect(nearlyFull.jing).toBe(420);
    // 3 小时（180 分钟）远超 30 分钟窗口 → 只按 30 分钟恢复/消耗
    const offline = applyRegen(HURT, MAX, 180, DEFAULT_PARAMS);
    expect(offline.qi).toBe(Math.floor(420 * 0.03 * 30));
    expect(offline.food).toBe(300 - Math.floor(0.8 * 30));
    expect(offline.water).toBe(300 - Math.floor(1.2 * 30));
    const drained = applyRegen({ ...HURT, food: 5, water: 3 }, MAX, 10, DEFAULT_PARAMS);
    expect(drained.food).toBe(0);
    expect(drained.water).toBe(0);
  });
});
