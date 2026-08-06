import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, effectivePotential } from "./params.js";
import {
  isLevelAllowed,
  learnUp,
  practiceCost,
  practiceOnce,
  practicePointsNeeded,
  studyCost,
  studyOnce,
  type SkillMap,
} from "./growth.js";

const P = DEFAULT_PARAMS;
const MAX_LEVEL = 100;

function learnInput(overrides: Partial<Parameters<typeof learnUp>[0]> = {}) {
  return {
    params: P,
    exp: 100_000,
    potential: 500,
    learnedPoints: 0,
    jing: 300,
    int: 20,
    skillId: "basic_sword",
    skills: {} as SkillMap,
    maxLevel: MAX_LEVEL,
    ...overrides,
  };
}

function practiceInput(overrides: Partial<Parameters<typeof practiceOnce>[0]> = {}) {
  return {
    params: P,
    qi: 300,
    skillId: "basic_sword",
    skills: {} as SkillMap,
    maxLevel: MAX_LEVEL,
    ...overrides,
  };
}

describe("exp 门槛（pkuxkx 对照：武功³/10 > 经验 无法深造）", () => {
  it("level 20 需 800 经验：799 不行，800 可以", () => {
    expect(isLevelAllowed(P, 799, 20)).toBe(false);
    expect(isLevelAllowed(P, 800, 20)).toBe(true);
  });

  it("高等所需经验随指数增长", () => {
    expect(isLevelAllowed(P, 1000, 50)).toBe(false); // 50³/10 = 12500
    expect(isLevelAllowed(P, 12_500, 50)).toBe(true);
  });
});

describe("learnUp（学习）", () => {
  it("成功：等级 +1，扣除潜能与精，learned_points 由调用方同步", () => {
    const r = learnUp(learnInput());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills["basic_sword"]).toEqual({ level: 1, practicePoints: 0 });
      expect(r.potentialSpent).toBe(1); // 1 * potentialCostPerLevel
      expect(r.jingSpent).toBe(Math.ceil(150 / 20)); // 8
    }
  });

  it("连续学习消耗递增（潜能系数随等级）", () => {
    let skills: SkillMap = {};
    let potential = 1000;
    let learned = 0;
    let jing = 5000;
    for (let i = 0; i < 5; i++) {
      const r = learnUp(learnInput({ skills, potential, learnedPoints: learned, jing }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        skills = r.skills;
        potential -= r.potentialSpent;
        learned += r.potentialSpent;
        jing -= r.jingSpent;
      }
    }
    expect(skills["basic_sword"]?.level).toBe(5);
    // 潜能成本 = 1+2+3+4+5 = 15
    expect(potential).toBe(1000 - 15);
    expect(learned).toBe(15);
  });

  it("exp 门槛不足 → exp_gate", () => {
    const r = learnUp(
      learnInput({ exp: 0, skills: { basic_sword: { level: 20, practicePoints: 0 } } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("exp_gate");
  });

  it("有效潜能不足 → potential（potential − learnedPoints）", () => {
    const r = learnUp(
      learnInput({
        potential: 10,
        learnedPoints: 9,
        skills: { basic_sword: { level: 5, practicePoints: 0 } }, // 下一级需 6 潜能
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("potential");
  });

  it("精不足 → jing", () => {
    const r = learnUp(learnInput({ jing: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("jing");
  });

  it("到达技能 maxLevel → max_level", () => {
    const r = learnUp(
      learnInput({ skills: { basic_sword: { level: MAX_LEVEL, practicePoints: 0 } } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("max_level");
  });
});

describe("practiceOnce（自练）", () => {
  it("攒够 level+1 点才升级；气血按当前等级递增消耗", () => {
    let skills: SkillMap = {};
    let qi = 5000;
    let actions = 0;
    for (;;) {
      const cur = skills["basic_sword"]?.level ?? 0;
      if (cur >= 3) break;
      const r = practiceOnce(practiceInput({ qi, skills }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        qi -= r.qiSpent;
        skills = r.skills;
        actions += 1;
      }
    }
    // 0→1 需 1 次，1→2 需 2 次，2→3 需 3 次 = 共 6 次
    expect(actions).toBe(6);
    // 消耗 = 20 + (21+21) + (22+22+22) = 128
    expect(qi).toBe(5000 - 128);
  });

  it("气血不足 → qi；满级 → max_level", () => {
    const poor = practiceOnce(practiceInput({ qi: 1 }));
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toBe("qi");

    const maxed = practiceOnce(
      practiceInput({ skills: { basic_sword: { level: MAX_LEVEL, practicePoints: 0 } } }),
    );
    expect(maxed.ok).toBe(false);
    if (!maxed.ok) expect(maxed.reason).toBe("max_level");
  });

  it("practicePointsNeeded / practiceCost 确定性", () => {
    expect(practicePointsNeeded(P, 0)).toBe(1);
    expect(practicePointsNeeded(P, 10)).toBe(11);
    expect(practiceCost(P, 0)).toBe(20);
    expect(practiceCost(P, 10)).toBe(30);
  });
});

describe("studyOnce（读书/领悟）", () => {
  it("消耗精，机制同 practice", () => {
    let r = studyOnce({
      params: P,
      jing: 500,
      skillId: "basic_sword",
      skills: {},
      maxLevel: MAX_LEVEL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills["basic_sword"]).toEqual({ level: 1, practicePoints: 0 });
      expect(r.jingSpent).toBe(studyCost(P, 0)); // 80
    }
    r = studyOnce({ params: P, jing: 1, skillId: "basic_sword", skills: {}, maxLevel: MAX_LEVEL });
    expect(r.ok).toBe(false);
  });
});

describe("有效潜能", () => {
  it("potential − learnedPoints，下限 0", () => {
    expect(effectivePotential(104, 4)).toBe(100);
    expect(effectivePotential(3, 10)).toBe(0);
  });
});
