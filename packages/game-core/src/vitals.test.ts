import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { applyRegen, clampEff, clampVitals, computeMaxVitals, type RegenAttrs } from "./vitals.js";

/** 新手村毕业常规属性（先天 20）。 */
const FRESH: Parameters<typeof computeMaxVitals>[1] = {
  str: 20,
  int: 20,
  con: 20,
  dex: 20,
  forceLevel: 0,
};

const FRESH_REGEN: RegenAttrs = {
  str: 20,
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
    expect(m.maxNeili).toBe(400);
    expect(m.maxQi).toBeGreaterThan(210);
    expect(m.maxJing).toBeGreaterThan(210);
    expect(m.maxJingli).toBeGreaterThan(50);
  });

  it("根骨偏高者气血更厚，悟性偏高者精神更厚", () => {
    const tank = computeMaxVitals(DEFAULT_PARAMS, {
      ...FRESH,
      con: 30,
      int: 10,
    });
    const scholar = computeMaxVitals(DEFAULT_PARAMS, {
      ...FRESH,
      con: 10,
      int: 30,
    });
    expect(tank.maxQi).toBeGreaterThan(scholar.maxQi);
    expect(scholar.maxJing).toBeGreaterThan(tank.maxJing);
  });

  it("同输入同输出（确定性）", () => {
    const a = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 33 });
    const b = computeMaxVitals(DEFAULT_PARAMS, { ...FRESH, forceLevel: 33 });
    expect(a).toEqual(b);
  });

  it("可覆盖参数表系数", () => {
    const p = {
      ...DEFAULT_PARAMS,
      vitals: { ...DEFAULT_PARAMS.vitals, qiPerCon: 4, forceQiPerLevel: 0 },
    };
    const m = computeMaxVitals(p, FRESH);
    expect(m.maxQi).toBe(50 + 20 * 4);
  });
});

describe("clampVitals / clampEff", () => {
  const max = computeMaxVitals(DEFAULT_PARAMS, FRESH);

  it("钳制越界值", () => {
    const clamped = clampVitals(
      {
        qi: 9999,
        jing: -5,
        jingli: 999,
        neili: -1,
        effQi: 9999,
        effJing: -1,
      },
      max,
    );
    expect(clamped.qi).toBe(max.maxQi);
    expect(clamped.jing).toBe(0);
    expect(clamped.jingli).toBe(max.maxJingli);
    expect(clamped.neili).toBe(0);
    expect(clamped.effQi).toBe(max.maxQi);
    expect(clamped.effJing).toBe(0);
  });

  it("clampEff 不超过 max", () => {
    expect(clampEff(120, 100)).toBe(100);
    expect(clampEff(-1, 100)).toBe(0);
    expect(clampEff(80, 100)).toBe(80);
  });
});

describe("applyRegen（DC-051：xkx heal_up 绝对值）", () => {
  const MAX = { maxQi: 420, maxJing: 420, maxJingli: 100, maxNeili: 100 };
  const HURT: Parameters<typeof applyRegen>[0] = {
    qi: 0,
    jing: 0,
    jingli: 0,
    neili: 0,
    effQi: 420,
    effJing: 420,
  };

  it("按 con/内力上限绝对值 × 时间差恢复", () => {
    // 每拍气=6+10=16、精=6+10=16、精力=10；10 分钟≈63.16 拍
    const next = applyRegen(HURT, MAX, 10, DEFAULT_PARAMS, FRESH_REGEN);
    expect(next).toMatchObject({ qi: 420, jing: 420, jingli: 100, neili: 0 });
  });

  it("恢复不超 eff/上限；时间差超窗口按窗口封顶", () => {
    const nearlyFull = applyRegen(
      { ...HURT, qi: 400, jing: 400, jingli: 90, neili: 95 },
      MAX,
      10,
      DEFAULT_PARAMS,
      FRESH_REGEN,
    );
    expect(nearlyFull.qi).toBe(420);
    expect(nearlyFull.jing).toBe(420);
    const offline = applyRegen(HURT, MAX, 180, DEFAULT_PARAMS, FRESH_REGEN);
    // 30 分钟窗口：气仍封顶 420
    expect(offline.qi).toBe(420);
  });

  it("内功等级驱动内力回复", () => {
    const withForce = applyRegen(HURT, MAX, 10, DEFAULT_PARAMS, {
      ...FRESH_REGEN,
      forceLevel: 20,
    });
    // 每拍内力 floor(20/2)=10 → 10 分钟回满 100
    expect(withForce.neili).toBe(100);
  });
});
