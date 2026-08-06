import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { runBattle, attackOnly, type BattleContext } from "./combat.js";
import { createSeededRng } from "./random.js";
import {
  canUsePerform,
  createPerformCooldownTracker,
  evaluatePerformConditions,
  performSelector,
  performToBattleAction,
  type PerformEvalContext,
} from "./perform.js";
import type { Perform } from "@yjh/content";

const SWIFT: Perform = {
  id: "swift_slash",
  skillId: "basic_sword",
  name: "疾风斩",
  cost: { qi: 0, jing: 5, neili: 10 },
  cooldownTurns: 3,
  conditions: [{ type: "self_neili_above_pct", value: 30 }],
  effect: { type: "damage", amount: 12, target: "enemy" },
  description: "",
};

const QIANKUN: Perform = {
  id: "qiankun_gather",
  skillId: "xuanmen_force",
  name: "乾坤聚气",
  cost: { qi: 0, jing: 0, neili: 15 },
  cooldownTurns: 5,
  conditions: [{ type: "self_qi_below_pct", value: 60 }],
  effect: { type: "heal", amount: 25, target: "self" },
  description: "",
};

const TAIYI: Perform = {
  id: "taiyi_rain",
  skillId: "xuanmen_sword",
  name: "太乙剑雨",
  cost: { qi: 0, jing: 8, neili: 12 },
  cooldownTurns: 6,
  conditions: [{ type: "skill_level_at_least", value: 40 }],
  effect: { type: "damage", amount: 20, target: "enemy" },
  description: "",
};

const ZHUFENG: Perform = {
  id: "zhufeng_break",
  skillId: "xuanmen_sword",
  name: "追风破",
  cost: { qi: 0, jing: 0, neili: 20 },
  cooldownTurns: 8,
  conditions: [{ type: "enemy_qi_below_pct", value: 30 }],
  effect: { type: "damage", amount: 30, target: "enemy" },
  description: "",
};

const BUFF: Perform = {
  ...SWIFT,
  id: "buff_demo",
  effect: { type: "buff", amount: 5, target: "self" },
};

function evalCtx(
  overrides: Partial<PerformEvalContext> & { battle: BattleContext },
): PerformEvalContext {
  return { actor: "a", skillLevel: 50, ...overrides };
}

describe("evaluatePerformConditions", () => {
  const ctx = evalCtx({
    battle: {
      turn: 1,
      get: (k) =>
        k === "a"
          ? {
              qi: 100,
              maxQi: 200,
              jing: 100,
              maxJing: 100,
              neili: 80,
              maxNeili: 100,
              stats: { attack: 10, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 50 },
            }
          : {
              qi: 20,
              maxQi: 100,
              jing: 50,
              maxJing: 50,
              neili: 30,
              maxNeili: 50,
              stats: { attack: 5, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 10 },
            },
    },
  });

  it("self_neili_above_pct：内力 80/100 ≥ 30 → 满足", () => {
    expect(evaluatePerformConditions(SWIFT, ctx)).toBeNull();
  });

  it("self_qi_below_pct：气血 100/200 = 50% < 60 → 满足", () => {
    expect(evaluatePerformConditions(QIANKUN, ctx)).toBeNull();
  });

  it("skill_level_at_least：技能等级 50 ≥ 40 → 满足", () => {
    expect(evaluatePerformConditions(TAIYI, ctx)).toBeNull();
  });

  it("enemy_qi_below_pct：敌方 20/100 = 20% < 30 → 满足", () => {
    expect(evaluatePerformConditions(ZHUFENG, ctx)).toBeNull();
  });

  it("条件不满足返回原因（内力低于阈值）", () => {
    const low = evalCtx({
      battle: {
        turn: 1,
        get: (k) =>
          k === "a"
            ? {
                qi: 200,
                maxQi: 200,
                jing: 100,
                maxJing: 100,
                neili: 10,
                maxNeili: 100,
                stats: {
                  attack: 10,
                  defense: 0,
                  dodge: 0,
                  parry: 0,
                  weaponLevel: 0,
                  forceLevel: 50,
                },
              }
            : {
                qi: 100,
                maxQi: 100,
                jing: 50,
                maxJing: 50,
                neili: 30,
                maxNeili: 50,
                stats: {
                  attack: 5,
                  defense: 0,
                  dodge: 0,
                  parry: 0,
                  weaponLevel: 0,
                  forceLevel: 10,
                },
              },
      },
    });
    expect(evaluatePerformConditions(SWIFT, low)).toContain("self_neili_above_pct");
  });
});

describe("performToBattleAction", () => {
  it("damage 映射为伤害动作（physical）", () => {
    const a = performToBattleAction(SWIFT);
    expect(a).toEqual({
      type: "perform",
      cost: { qi: undefined, jing: 5, neili: 10 },
      effect: { kind: "damage", type: "physical", flat: 12 },
    });
  });

  it("heal 映射为治疗动作", () => {
    const a = performToBattleAction(QIANKUN);
    expect(a?.type).toBe("perform");
    if (a?.type === "perform") {
      expect(a.effect).toEqual({ kind: "heal", flat: 25 });
    }
  });

  it("buff 返回 null（v1 不支持）", () => {
    expect(performToBattleAction(BUFF)).toBeNull();
  });
});

describe("canUsePerform（条件/消耗/冷却/类型）", () => {
  const ctx = evalCtx({
    battle: {
      turn: 1,
      get: (k) =>
        k === "a"
          ? {
              qi: 100,
              maxQi: 200,
              jing: 100,
              maxJing: 100,
              neili: 80,
              maxNeili: 100,
              stats: { attack: 10, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 50 },
            }
          : {
              qi: 100,
              maxQi: 100,
              jing: 50,
              maxJing: 50,
              neili: 30,
              maxNeili: 50,
              stats: { attack: 5, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 10 },
            },
    },
  });

  it("全部满足 → ok", () => {
    expect(canUsePerform(SWIFT, ctx, 1, createPerformCooldownTracker()).ok).toBe(true);
  });

  it("消耗不足 → reason=cost", () => {
    // 用 TAIYI（条件 skill_level_at_least 40，技能等级 50 通过），jing 不足触发 cost
    const poor = evalCtx({
      battle: {
        turn: 1,
        get: (k) =>
          k === "a"
            ? {
                qi: 100,
                maxQi: 200,
                jing: 2,
                maxJing: 100,
                neili: 100,
                maxNeili: 100,
                stats: {
                  attack: 10,
                  defense: 0,
                  dodge: 0,
                  parry: 0,
                  weaponLevel: 0,
                  forceLevel: 50,
                },
              }
            : {
                qi: 100,
                maxQi: 100,
                jing: 50,
                maxJing: 50,
                neili: 30,
                maxNeili: 50,
                stats: {
                  attack: 5,
                  defense: 0,
                  dodge: 0,
                  parry: 0,
                  weaponLevel: 0,
                  forceLevel: 10,
                },
              },
      },
    });
    const r = canUsePerform(TAIYI, poor, 1, createPerformCooldownTracker());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cost");
  });

  it("冷却未到 → reason=cooldown", () => {
    const tracker = createPerformCooldownTracker();
    tracker.markUsed(SWIFT, 1);
    const r = canUsePerform(SWIFT, ctx, 2, tracker);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cooldown");
  });

  it("buff → reason=buff_unsupported", () => {
    const r = canUsePerform(BUFF, ctx, 1, createPerformCooldownTracker());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("buff_unsupported");
  });
});

describe("冷却跟踪", () => {
  it("使用后 cooldownTurns 内不可再用，到期后可再用", () => {
    const tracker = createPerformCooldownTracker();
    expect(tracker.canUse(SWIFT, 1)).toBe(true);
    tracker.markUsed(SWIFT, 1);
    expect(tracker.canUse(SWIFT, 2)).toBe(false);
    expect(tracker.canUse(SWIFT, 3)).toBe(false);
    expect(tracker.canUse(SWIFT, 4)).toBe(true); // 1 + 3
  });
});

describe("performSelector 接入战斗引擎", () => {
  const skills = new Map([
    ["basic_sword", 50],
    ["xuanmen_force", 50],
    ["xuanmen_sword", 50],
  ]);

  it("战斗中出现绝招事件且无 perform_failed（条件/消耗/冷却均由选择器把控）", () => {
    const result = runBattle({
      a: {
        id: "hero",
        name: "侠客",
        qi: 300,
        maxQi: 300,
        jing: 100,
        maxJing: 100,
        neili: 100,
        maxNeili: 100,
        stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 30, forceLevel: 50 },
      },
      b: {
        id: "bandit",
        name: "山贼",
        qi: 150,
        maxQi: 150,
        jing: 50,
        maxJing: 50,
        neili: 50,
        maxNeili: 50,
        stats: { attack: 8, defense: 3, dodge: 3, parry: 3, weaponLevel: 10, forceLevel: 10 },
      },
      selectors: { a: performSelector([SWIFT, TAIYI, ZHUFENG], skills), b: attackOnly },
      seed: 42,
      params: DEFAULT_PARAMS,
    });
    expect(result.events.some((e) => e.type === "perform" && e.actor === "a")).toBe(true);
    expect(result.events.some((e) => e.type === "perform_failed")).toBe(false);
  });

  it("确定性：同 seed 战报完全一致", () => {
    const mk = () =>
      runBattle({
        a: {
          id: "hero",
          name: "侠客",
          qi: 300,
          maxQi: 300,
          jing: 100,
          maxJing: 100,
          neili: 100,
          maxNeili: 100,
          stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 30, forceLevel: 50 },
        },
        b: {
          id: "bandit",
          name: "山贼",
          qi: 150,
          maxQi: 150,
          jing: 50,
          maxJing: 50,
          neili: 50,
          maxNeili: 50,
          stats: { attack: 8, defense: 3, dodge: 3, parry: 3, weaponLevel: 10, forceLevel: 10 },
        },
        selectors: { a: performSelector([SWIFT, TAIYI, ZHUFENG], skills), b: attackOnly },
        seed: 7,
        params: DEFAULT_PARAMS,
      });
    expect(mk()).toEqual(mk());
  });

  it("追击绝招在敌方低血时触发（enemy_qi_below_pct）", () => {
    const result = runBattle({
      a: {
        id: "hero",
        name: "侠客",
        qi: 300,
        maxQi: 300,
        jing: 100,
        maxJing: 100,
        neili: 200,
        maxNeili: 200,
        stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 30, forceLevel: 50 },
      },
      b: {
        id: "bandit",
        name: "山贼",
        qi: 150,
        maxQi: 150,
        jing: 50,
        maxJing: 50,
        neili: 50,
        maxNeili: 50,
        stats: { attack: 1, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 },
      },
      selectors: { a: performSelector([ZHUFENG], skills), b: attackOnly },
      seed: 11,
      params: DEFAULT_PARAMS,
    });
    expect(result.events.some((e) => e.type === "perform" && e.actor === "a")).toBe(true);
  });
});
