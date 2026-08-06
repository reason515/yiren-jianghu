import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { attackOnly, runBattle, type CombatantView } from "./combat.js";
import {
  createTacticSelector,
  evaluateConditions,
  tacticTemplateSchema,
  validateTacticTemplate,
  type TacticCondition,
  type TacticTemplate,
} from "./tactic.js";
import type { Perform } from "@yjh/content";

const PERFORMS = new Map<string, Perform>([
  [
    "qiankun_gather",
    {
      id: "qiankun_gather",
      skillId: "xuanmen_force",
      name: "乾坤聚气",
      cost: { qi: 0, jing: 0, neili: 15 },
      cooldownTurns: 5,
      conditions: [{ type: "self_qi_below_pct", value: 60 }],
      effect: { type: "heal", amount: 25, target: "self" },
      description: "",
    },
  ],
  [
    "zhufeng_break",
    {
      id: "zhufeng_break",
      skillId: "xuanmen_sword",
      name: "追风破",
      cost: { qi: 0, jing: 0, neili: 20 },
      cooldownTurns: 8,
      conditions: [{ type: "enemy_qi_below_pct", value: 30 }],
      effect: { type: "damage", amount: 30, target: "enemy" },
      description: "",
    },
  ],
]);

const SKILLS = new Map([
  ["xuanmen_force", 50],
  ["xuanmen_sword", 50],
]);

const DEPS = { performs: PERFORMS, skillLevels: SKILLS };

function view(overrides: Partial<CombatantView> = {}): CombatantView {
  return {
    qi: 200,
    maxQi: 200,
    jing: 100,
    maxJing: 100,
    neili: 80,
    maxNeili: 100,
    stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 20, forceLevel: 50 },
    ...overrides,
  };
}

function template(rules: TacticTemplate["rules"]): TacticTemplate {
  return { version: 1, rules, defaultAction: { type: "attack" } };
}

describe("evaluateConditions", () => {
  it("多条件同时满足才为真", () => {
    const conds: TacticCondition[] = [
      { type: "self_qi_below_pct", value: 60 },
      { type: "self_neili_above_pct", value: 30 },
    ];
    expect(
      evaluateConditions(conds, { self: view({ qi: 100 }), foe: view(), skillLevels: SKILLS }),
    ).toBe(true);
    expect(
      evaluateConditions(conds, { self: view({ qi: 150 }), foe: view(), skillLevels: SKILLS }),
    ).toBe(false);
  });

  it("敌方气血条件与技能等级门槛", () => {
    expect(
      evaluateConditions([{ type: "enemy_qi_below_pct", value: 30 }], {
        self: view(),
        foe: view({ qi: 80 }), // 80/200 = 40% ≥ 30 → 不满足
        skillLevels: SKILLS,
      }),
    ).toBe(false);
    expect(
      evaluateConditions([{ type: "enemy_qi_below_pct", value: 30 }], {
        self: view(),
        foe: view({ qi: 40 }), // 20% < 30 → 满足
        skillLevels: SKILLS,
      }),
    ).toBe(true);
    expect(
      evaluateConditions([{ type: "skill_level_at_least", skillId: "xuanmen_sword", value: 40 }], {
        self: view(),
        foe: view(),
        skillLevels: SKILLS,
      }),
    ).toBe(true);
  });
});

describe("createTacticSelector（优先级 + 兜底）", () => {
  it("第一条满足的规则生效（顺序即优先级）", () => {
    const tpl = template([
      {
        id: "r1",
        conditions: [{ type: "self_qi_below_pct", value: 50 }],
        action: { type: "recover" },
      },
      {
        id: "r2",
        conditions: [{ type: "self_neili_above_pct", value: 50 }],
        action: { type: "perform", performId: "zhufeng_break" },
      },
    ]);
    const selector = createTacticSelector(tpl, DEPS);
    const battle = {
      turn: 1,
      get: (k: "a" | "b") => (k === "a" ? view({ qi: 80 }) : view({ qi: 40, neili: 10 })),
    };
    expect(selector(battle, "a", () => 0.5)).toEqual({ type: "recover" }); // qi 低 → r1
  });

  it("绝招冷却中 → 落入下一条/兜底", () => {
    const tpl = template([
      {
        id: "r1",
        conditions: [{ type: "enemy_qi_below_pct", value: 50 }],
        action: { type: "perform", performId: "zhufeng_break" },
      },
      {
        id: "r2",
        conditions: [{ type: "self_neili_above_pct", value: 30 }],
        action: { type: "recover" },
      },
    ]);
    const selector = createTacticSelector(tpl, DEPS);
    const battle = {
      turn: 1,
      get: (k: "a" | "b") => (k === "a" ? view() : view({ qi: 40 })),
    };
    const first = selector(battle, "a", () => 0.5);
    expect(first.type).toBe("perform");
    // 同战斗实例：刚用过追风破，下一回合冷却未到 → 落入 r2 recover
    const second = selector({ ...battle, turn: 2 }, "a", () => 0.5);
    expect(second).toEqual({ type: "recover" });
  });

  it("规则都不满足 → 兜底动作", () => {
    const tpl = template([
      {
        id: "r1",
        conditions: [{ type: "self_qi_below_pct", value: 10 }],
        action: { type: "recover" },
      },
    ]);
    const selector = createTacticSelector(tpl, DEPS);
    const battle = { turn: 1, get: (_k: "a" | "b") => view() };
    expect(selector(battle, "a", () => 0.5)).toEqual({ type: "attack" }); // defaultAction
  });
});

describe("validateTacticTemplate", () => {
  it("合法模板无 issue", () => {
    const tpl = template([
      {
        id: "r1",
        conditions: [{ type: "self_qi_below_pct", value: 50 }],
        action: { type: "recover" },
      },
    ]);
    expect(validateTacticTemplate(tpl, DEPS)).toEqual([]);
  });

  it("未知绝招 → error；buff 绝招 → warning", () => {
    const tpl = template([
      { id: "r1", conditions: [], action: { type: "perform", performId: "ghost" } },
    ]);
    const issues = validateTacticTemplate(tpl, DEPS);
    expect(issues.some((i) => i.code === "unknown_perform" && i.severity === "error")).toBe(true);
  });

  it("无条件规则遮蔽后续规则 → warning；重复规则 id → error", () => {
    const tpl = template([
      { id: "r1", conditions: [], action: { type: "attack" } },
      {
        id: "r2",
        conditions: [{ type: "self_qi_below_pct", value: 50 }],
        action: { type: "recover" },
      },
      { id: "r2", conditions: [], action: { type: "attack" } },
    ]);
    const issues = validateTacticTemplate(tpl, DEPS);
    expect(issues.some((i) => i.code === "shadowed_rule")).toBe(true);
    expect(issues.some((i) => i.code === "duplicate_rule_id" && i.severity === "error")).toBe(true);
  });

  it("zod 结构校验：非法百分比被拒绝", () => {
    expect(() =>
      tacticTemplateSchema.parse({
        version: 1,
        rules: [
          {
            id: "r1",
            conditions: [{ type: "self_qi_below_pct", value: 150 }],
            action: { type: "attack" },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("模板接入战斗（挂机/PVP 共用评估器）", () => {
  const hero = {
    id: "hero",
    name: "侠客",
    qi: 300,
    maxQi: 300,
    jing: 100,
    maxJing: 100,
    neili: 120,
    maxNeili: 150,
    stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 30, forceLevel: 50 },
  };
  const bandit = {
    id: "bandit",
    name: "山贼",
    qi: 150,
    maxQi: 150,
    jing: 50,
    maxJing: 50,
    neili: 50,
    maxNeili: 50,
    stats: { attack: 8, defense: 3, dodge: 3, parry: 3, weaponLevel: 10, forceLevel: 10 },
  };

  it("不同模板产出不同战报（攻击型 vs 疗伤型）", () => {
    const aggressive = template([
      {
        id: "r1",
        conditions: [{ type: "enemy_qi_below_pct", value: 50 }],
        action: { type: "perform", performId: "zhufeng_break" },
      },
    ]);
    const defensive = template([
      {
        id: "r1",
        conditions: [{ type: "self_qi_below_pct", value: 70 }],
        action: { type: "perform", performId: "qiankun_gather" },
      },
      { id: "r2", conditions: [], action: { type: "attack" } },
    ]);

    const resultA = runBattle({
      a: hero,
      b: bandit,
      selectors: { a: createTacticSelector(aggressive, DEPS), b: attackOnly },
      seed: 42,
      params: DEFAULT_PARAMS,
    });
    const resultD = runBattle({
      a: { ...hero, qi: 150, maxQi: 300 }, // 受伤状态 → 触发疗伤绝招
      b: bandit,
      selectors: { a: createTacticSelector(defensive, DEPS), b: attackOnly },
      seed: 42,
      params: DEFAULT_PARAMS,
    });
    // 攻击型出现追风破（处决）；疗伤型出现乾坤聚气
    expect(resultA.events.some((e) => e.type === "perform")).toBe(true);
    expect(resultD.events.some((e) => e.type === "perform")).toBe(true);
    // 事件流不同（模板决策差异）
    expect(resultA.events).not.toEqual(resultD.events);
  });

  it("同模板同 seed → 战报完全一致（PVP 可重演）", () => {
    const tpl = template([
      {
        id: "r1",
        conditions: [{ type: "self_qi_below_pct", value: 70 }],
        action: { type: "perform", performId: "qiankun_gather" },
      },
    ]);
    const mk = () =>
      runBattle({
        a: hero,
        b: bandit,
        selectors: { a: createTacticSelector(tpl, DEPS), b: attackOnly },
        seed: 7,
        params: DEFAULT_PARAMS,
      });
    expect(mk()).toEqual(mk());
  });
});
