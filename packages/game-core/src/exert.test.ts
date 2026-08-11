import { describe, expect, it } from "vitest";
import type { Perform } from "@yjh/content";
import { applyFieldExert, isFieldExertPerform } from "./exert.js";

const heal: Perform = {
  id: "qiankun_gather",
  skillId: "xuanmen_force",
  name: "乾坤聚气",
  learnMinLevel: 30,
  learnRequires: [],
  cost: { qi: 0, jing: 0, neili: 15 },
  cooldownTurns: 5,
  conditions: [{ type: "self_qi_below_pct", value: 60 }],
  effect: { type: "heal", amount: 25, target: "self" },
  description: "",
};

const cure: Perform = {
  id: "cure_wound",
  skillId: "xuanmen_force",
  name: "玄门疗伤",
  learnMinLevel: 15,
  learnRequires: [],
  cost: { qi: 0, jing: 5, neili: 20 },
  cooldownTurns: 4,
  conditions: [{ type: "self_neili_above_pct", value: 20 }],
  effect: { type: "heal", amount: 18, target: "self" },
  description: "",
};

const healJing: Perform = {
  id: "force_calm_spirit",
  skillId: "xuanmen_force",
  name: "静心回神",
  learnMinLevel: 10,
  learnRequires: [],
  cost: { qi: 0, jing: 0, neili: 18 },
  cooldownTurns: 3,
  conditions: [{ type: "self_neili_above_pct", value: 15 }],
  effect: { type: "heal_jing", amount: 22, target: "self" },
  description: "",
};

const slash: Perform = {
  id: "swift_slash",
  skillId: "basic_sword",
  name: "疾风斩",
  learnMinLevel: 0,
  learnRequires: [],
  cost: { qi: 0, jing: 0, neili: 10 },
  cooldownTurns: 2,
  conditions: [],
  effect: { type: "damage", amount: 20, target: "enemy" },
  description: "",
};

const baseVitals = {
  qi: 40,
  maxQi: 100,
  effQi: 80,
  jing: 30,
  maxJing: 100,
  effJing: 90,
  neili: 50,
  maxNeili: 100,
};

describe("applyFieldExert", () => {
  it("识别场外可用绝招", () => {
    expect(isFieldExertPerform(heal)).toBe(true);
    expect(isFieldExertPerform(cure)).toBe(true);
    expect(isFieldExertPerform(healJing)).toBe(true);
    expect(isFieldExertPerform(slash)).toBe(false);
  });

  it("回气成功并扣内力，不超过 effQi", () => {
    const result = applyFieldExert({
      perform: heal,
      learned: true,
      skillLevel: 30,
      vitals: baseVitals,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("heal");
    expect(result.vitals.neili).toBe(35);
    expect(result.vitals.qi).toBeGreaterThan(40);
    expect(result.vitals.qi).toBeLessThanOrEqual(80);
  });

  it("疗伤抬 effQi", () => {
    const result = applyFieldExert({
      perform: cure,
      learned: true,
      skillLevel: 20,
      vitals: { ...baseVitals, qi: 50, jing: 40, neili: 40, effQi: 60 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("cure");
    expect(result.vitals.effQi).toBeGreaterThan(60);
  });

  it("回精成功", () => {
    const result = applyFieldExert({
      perform: healJing,
      learned: true,
      skillLevel: 15,
      vitals: baseVitals,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("heal_jing");
    expect(result.vitals.jing).toBeGreaterThan(30);
    expect(result.vitals.jing).toBeLessThanOrEqual(90);
    expect(result.vitals.neili).toBe(32);
  });

  it("拒绝伤害类、未学、消耗不足", () => {
    expect(
      applyFieldExert({ perform: slash, learned: true, skillLevel: 10, vitals: baseVitals }).ok,
    ).toBe(false);
    const notLearned = applyFieldExert({
      perform: healJing,
      learned: false,
      skillLevel: 10,
      vitals: baseVitals,
    });
    expect(notLearned.ok).toBe(false);
    if (!notLearned.ok) expect(notLearned.reason).toBe("not_learned");
    const lowCost = applyFieldExert({
      perform: healJing,
      learned: true,
      skillLevel: 10,
      vitals: { ...baseVitals, neili: 5 },
    });
    expect(lowCost.ok).toBe(false);
    if (!lowCost.ok) expect(lowCost.reason).toBe("cost");
  });

  it("气已满则无效果", () => {
    const result = applyFieldExert({
      perform: {
        ...heal,
        conditions: [],
      },
      learned: true,
      skillLevel: 30,
      vitals: { ...baseVitals, qi: 80, effQi: 80 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_effect");
  });
});
