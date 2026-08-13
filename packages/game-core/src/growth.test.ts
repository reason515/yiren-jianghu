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
    silver: 100,
    tuitionSilver: 2,
    skillId: "basic_sword",
    skills: {} as SkillMap,
    maxLevel: MAX_LEVEL,
    teachCap: MAX_LEVEL,
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

describe("exp 门槛（小数值：武功²×2）", () => {
  it("目标等级 1 豁免历练（DC-055）；等级 2 仍需 ≥8", () => {
    expect(isLevelAllowed(P, 0, 1)).toBe(true);
    expect(isLevelAllowed(P, 0, 2)).toBe(false);
    expect(isLevelAllowed(P, 7, 2)).toBe(false);
    expect(isLevelAllowed(P, 8, 2)).toBe(true);
  });

  it("level 20 需 800 历练：799 不行，800 可以", () => {
    expect(isLevelAllowed(P, 799, 20)).toBe(false);
    expect(isLevelAllowed(P, 800, 20)).toBe(true);
  });

  it("高等所需历练随平方增长（不再立方爆炸）", () => {
    // 50²×2 = 5000
    expect(isLevelAllowed(P, 4999, 50)).toBe(false);
    expect(isLevelAllowed(P, 5000, 50)).toBe(true);
    // 100²×2 = 20000
    expect(isLevelAllowed(P, 20_000, 100)).toBe(true);
  });
});

describe("learnUp（学习）", () => {
  it("exp=0 仍可学到 1 级（DC-055 豁免）；精耗仍 ×2", () => {
    const r = learnUp(learnInput({ exp: 0 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills["basic_sword"]).toEqual({ level: 1, practicePoints: 0 });
      expect(r.jingSpent).toBe(Math.ceil(150 / 20) * 2);
    }
  });

  it("成功：等级 +1，扣除潜能与精与银两；首学精耗 ×2", () => {
    const r = learnUp(learnInput());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills["basic_sword"]).toEqual({ level: 1, practicePoints: 0 });
      expect(r.potentialSpent).toBe(1);
      expect(r.jingSpent).toBe(Math.ceil(150 / 20) * 2); // 首学 ×2 → 16
      expect(r.silverSpent).toBe(2);
    }
  });

  it("已有等级：精耗不再加倍；学费可为 0", () => {
    const r = learnUp(
      learnInput({ skills: { basic_sword: { level: 1, practicePoints: 0 } }, tuitionSilver: 0 }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.jingSpent).toBe(Math.ceil(150 / 20));
      expect(r.silverSpent).toBe(0);
    }
  });

  it("连续学习消耗递增（潜能系数随等级）", () => {
    let skills: SkillMap = {};
    let potential = 1000;
    let learned = 0;
    let jing = 5000;
    let silver = 100;
    for (let i = 0; i < 5; i++) {
      const r = learnUp(learnInput({ skills, potential, learnedPoints: learned, jing, silver }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        skills = r.skills;
        potential -= r.potentialSpent;
        learned += r.potentialSpent;
        jing -= r.jingSpent;
        silver -= r.silverSpent;
      }
    }
    expect(skills["basic_sword"]?.level).toBe(5);
    expect(potential).toBe(1000 - 15);
    expect(learned).toBe(15);
    expect(silver).toBe(90);
  });

  it("银两不足 → silver", () => {
    const r = learnUp(learnInput({ silver: 1, tuitionSilver: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("silver");
  });

  it("超过师父可教上限 → teacher_cap", () => {
    const r = learnUp(
      learnInput({
        teachCap: 1,
        skills: { basic_sword: { level: 1, practicePoints: 0 } },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("teacher_cap");
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
        skills: { basic_sword: { level: 5, practicePoints: 0 } },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("potential");
    expect(effectivePotential(10, 9)).toBe(1);
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
    // 消耗 = 12 + (13+13) + (14+14+14) = 80
    expect(qi).toBe(5000 - 80);
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
    expect(practiceCost(P, 0)).toBe(12);
    expect(practiceCost(P, 10)).toBe(22);
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
      expect(r.jingSpent).toBe(studyCost(P, 0)); // studyJingBase=40
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
