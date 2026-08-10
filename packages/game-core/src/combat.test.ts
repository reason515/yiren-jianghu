import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import {
  advanceBattleRound,
  aliveFoeIds,
  applyCombatDamage,
  applyCureQi,
  applyHealQi,
  attackOnly,
  attackOrRecover,
  createBattleState,
  computeAttackDamage,
  pickAutoTarget,
  resolveAttack,
  runBattle,
  type BattleInput,
  type Combatant,
  type MoveInfo,
} from "./combat.js";
import { createSeededRng } from "./random.js";

function fighter(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    qi: 200,
    maxQi: 200,
    jing: 100,
    maxJing: 100,
    neili: 50,
    maxNeili: 100,
    stats: {
      attack: 10,
      defense: 5,
      dodge: 5,
      parry: 5,
      weaponLevel: 10,
      forceLevel: 5,
      attackSkillLevel: 10,
      dodgeSkillLevel: 5,
      parrySkillLevel: 5,
      combatExp: 0,
      str: 10,
      dex: 10,
      con: 10,
    },
    ...overrides,
  };
}

/** str=dex=10、各门类等级 0 的对照战斗体：ap=dp=pp=10，闪避/招架概率恰为 0.5，便于精确控制分支。 */
function evenFighter(id: string): Combatant {
  return fighter(id, {
    stats: {
      attack: 10,
      defense: 5,
      dodge: 5,
      parry: 5,
      weaponLevel: 0,
      forceLevel: 0,
      attackSkillLevel: 0,
      dodgeSkillLevel: 0,
      parrySkillLevel: 0,
      combatExp: 0,
      str: 10,
      dex: 10,
      con: 10,
    },
  });
}

/** 可控 RNG：按顺序吐出预设值。 */
function stubRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

describe("命中判定与伤害（纯函数，DC-041 skillPower 模型）", () => {
  it("伤害基础值：攻击+武器+内功-防御，下限 1；招式按 damage/force 加成", () => {
    const rng = stubRng([0.5]); // 无浮动
    const atk = fighter("a", {
      stats: {
        ...fighter("a").stats,
        attack: 30,
        weaponLevel: 20,
        forceLevel: 10,
        defense: 0,
        dodge: 0,
        parry: 0,
      },
    });
    const def = fighter("b", {
      stats: {
        ...fighter("b").stats,
        attack: 0,
        weaponLevel: 0,
        forceLevel: 0,
        defense: 100,
        dodge: 0,
        parry: 0,
      },
    });
    // base = 30 + 20*0.4 + 10*0.3 - 100*0.5 = 30+8+3-50 = -9 → 下限 1
    expect(computeAttackDamage(DEFAULT_PARAMS, atk, def, rng)).toBe(1);
    const def2 = { ...def, stats: { ...def.stats, defense: 0 } };
    // base = 30+8+3-0 = 41（无浮动）
    expect(computeAttackDamage(DEFAULT_PARAMS, atk, def2, stubRng([0.5]))).toBe(41);

    const move: MoveInfo = { id: "m1", name: "式一", damage: 50, force: 20 };
    // base(41) * 1.5 + forceLevel(10)*20/100 = 61.5 + 2 = 63.5 → round 64
    expect(computeAttackDamage(DEFAULT_PARAMS, atk, def2, stubRng([0.5]), move)).toBe(64);
  });

  it("resolveAttack 分支：dodge / parry / damage（ap=dp=pp 时概率恰为 0.5）", () => {
    const p = DEFAULT_PARAMS;
    const a = evenFighter("a");
    const b = evenFighter("b");
    // 第一次判定 0.0 < 0.5 → 闪避
    expect(resolveAttack(p, a, b, stubRng([0.0])).type).toBe("dodge");
    // 不闪（0.99≥0.5）、不架（0.99≥0.5）→ 命中；第三个值为伤害浮动
    expect(resolveAttack(p, a, b, stubRng([0.99, 0.99, 0.5])).type).toBe("damage");
    // 不闪、招架（0.0<0.5）→ parry，伤害打 3 折且下限 1
    const parried = resolveAttack(p, a, b, stubRng([0.99, 0.0, 0.5]));
    expect(parried.type).toBe("parry");
    if (parried.type === "parry") {
      expect(parried.damage).toBeGreaterThanOrEqual(1);
    }
  });

  it("命中时回传 moveId/moveName（战报叙事用）", () => {
    const p = DEFAULT_PARAMS;
    const move: MoveInfo = { id: "m1", name: "式一", damage: 0, force: 0 };
    const outcome = resolveAttack(
      p,
      evenFighter("a"),
      evenFighter("b"),
      stubRng([0.99, 0.99, 0.5]),
      move,
    );
    expect(outcome).toMatchObject({ type: "damage", moveId: "m1", moveName: "式一" });
  });

  it("招式 dodge 加成攻方命中侧有效等级（DC-047）", () => {
    const move: MoveInfo = { id: "m1", name: "轻灵", damage: 0, force: 0, dodge: 100 };
    expect(
      resolveAttack(DEFAULT_PARAMS, evenFighter("a"), evenFighter("b"), stubRng([0.4])).type,
    ).toBe("dodge");
    expect(
      resolveAttack(
        DEFAULT_PARAMS,
        evenFighter("a"),
        evenFighter("b"),
        stubRng([0.4, 0.99, 0.5]),
        move,
      ).type,
    ).toBe("damage");
  });

  it("命中结果带 hook 标记（DC-049）", () => {
    expect(
      resolveAttack(DEFAULT_PARAMS, evenFighter("a"), evenFighter("b"), stubRng([0.0])).hook,
    ).toBe("after_dodge");
    expect(
      resolveAttack(DEFAULT_PARAMS, evenFighter("a"), evenFighter("b"), stubRng([0.99, 0.99, 0.5]))
        .hook,
    ).toBe("after_hit");
  });

  it("伤势压低 effQi，回气不超过伤势上限（DC-048）", () => {
    const target = fighter("t", { qi: 100, maxQi: 100, effQi: 100 });
    applyCombatDamage(target, 40, DEFAULT_PARAMS);
    expect(target.qi).toBe(60);
    expect(target.effQi).toBeLessThan(100);
    const before = target.qi;
    applyHealQi(target, 999);
    expect(target.qi).toBe(target.effQi);
    expect(target.qi).toBeGreaterThanOrEqual(before);
    const raised = applyCureQi(target, 20);
    expect(raised).toBeGreaterThan(0);
    expect(target.effQi).toBeLessThanOrEqual(100);
  });
});

describe("runBattle（战斗循环）", () => {
  function battle(overrides: Partial<BattleInput> = {}): ReturnType<typeof runBattle> {
    return runBattle({
      a: fighter("a"),
      b: fighter("b"),
      selectors: { a: attackOnly, b: attackOnly },
      seed: 42,
      params: DEFAULT_PARAMS,
      ...overrides,
    });
  }

  it("确定性：同 seed 同输入 → 完全相同的战报", () => {
    const r1 = battle();
    const r2 = battle();
    expect(r1).toEqual(r2);
  });

  it("战力悬殊时稳定获胜（多 seed 验证）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const result = battle({
        seed,
        a: fighter("a", {
          stats: {
            ...fighter("a").stats,
            attack: 999,
            defense: 0,
            dodge: 0,
            parry: 0,
            weaponLevel: 100,
            forceLevel: 100,
            attackSkillLevel: 100,
          },
        }),
        b: fighter("b", {
          qi: 50,
          maxQi: 50,
          stats: {
            ...fighter("b").stats,
            attack: 1,
            defense: 0,
            dodge: 0,
            parry: 0,
            weaponLevel: 0,
            forceLevel: 0,
            attackSkillLevel: 0,
          },
        }),
      });
      expect(result.winner).toBe("a");
    }
  });

  it("maxTurns 到达 → 平局", () => {
    const result = battle({
      maxTurns: 3,
      a: fighter("a", {
        qi: 9999,
        maxQi: 9999,
        stats: {
          ...fighter("a").stats,
          attack: 1,
          weaponLevel: 0,
          forceLevel: 0,
          defense: 0,
          dodge: 0,
          parry: 0,
        },
      }),
      b: fighter("b", {
        qi: 9999,
        maxQi: 9999,
        stats: {
          ...fighter("b").stats,
          attack: 1,
          weaponLevel: 0,
          forceLevel: 0,
          defense: 0,
          dodge: 0,
          parry: 0,
        },
      }),
    });
    expect(result.winner).toBe("draw");
    expect(result.turns).toBe(3);
  });

  it("回气动作增加内力并封顶", () => {
    const result = battle({
      a: fighter("a", { neili: 5, maxNeili: 100 }),
      selectors: { a: attackOrRecover, b: attackOnly },
    });
    const recovers = result.events.filter((e) => e.type === "recover" && e.actor === "a");
    expect(recovers.length).toBeGreaterThan(0);
    for (const r of recovers) {
      expect((r.data as { gained: number }).gained).toBe(DEFAULT_PARAMS.combat.recoverNeiliPerTurn);
    }
    // 内力从未超过上限
    for (const r of recovers) {
      expect((r.data as { neili: number }).neili).toBeLessThanOrEqual(100);
    }
  });

  it("逃跑成功 → 平局并标记 fled", () => {
    const result = battle({
      selectors: { a: () => ({ type: "flee" }), b: attackOnly },
    });
    expect(result.winner).toBe("draw");
    expect(result.fled).toBe("a");
    expect(result.events.some((e) => e.type === "flee")).toBe(true);
  });

  it("绝招：消耗内力造成伤害；内力不足则失败", () => {
    const rich = battle({
      a: fighter("a", { neili: 1000, maxNeili: 1000 }),
      selectors: {
        a: () => ({
          type: "perform",
          effect: { kind: "damage", type: "physical", flat: 30 },
          cost: { neili: 20 },
        }),
        b: attackOnly,
      },
    });
    // 每回合 30 伤害，b 200 血 → 约 7 次绝招内结束，内力充足不应失败
    expect(rich.events.some((e) => e.type === "perform" && e.actor === "a")).toBe(true);
    expect(rich.events.some((e) => e.type === "perform_failed")).toBe(false);
    expect(rich.winner).toBe("a");

    const poor = battle({
      a: fighter("a", { neili: 5, maxNeili: 100 }),
      selectors: {
        a: () => ({
          type: "perform",
          effect: { kind: "damage", type: "physical", flat: 30 },
          cost: { neili: 20 },
        }),
        b: attackOnly,
      },
    });
    expect(poor.events.some((e) => e.type === "perform_failed" && e.actor === "a")).toBe(true);
  });

  it("事件流含 battle_start（可重演依据）", () => {
    const result = battle({ seed: 7 });
    expect(result.events[0]).toMatchObject({ type: "battle_start" });
  });
});

describe("advanceBattleRound（持久化逐回合）", () => {
  it("不修改输入状态，并以 rngCalls 续算出确定性事件", () => {
    const initial = createBattleState(fighter("a"), fighter("b"));
    const input = {
      seed: 42,
      params: DEFAULT_PARAMS,
      playerAction: { type: "attack" } as const,
      opponentAction: { type: "attack" } as const,
    };
    const first = advanceBattleRound(initial, input);
    const repeated = advanceBattleRound(initial, input);
    expect(first).toEqual(repeated);
    expect(initial).toMatchObject({ turn: 0, rngCalls: 0, nextSeq: 1 });
    expect(first.events.map((event) => event.type)[0]).toBe("turn_start");
    expect(first.state.turn).toBe(1);
    expect(first.state.rngCalls).toBeGreaterThan(0);
    expect(first.state.foeIds).toEqual(["b0"]);

    const second = advanceBattleRound(first.state, input);
    expect(second.state.turn).toBe(2);
    expect(second.events[0]).toMatchObject({ seq: first.state.nextSeq, type: "turn_start" });
  });

  it("战斗结束后拒绝再次推进", () => {
    const initial = createBattleState(fighter("a"), fighter("b", { qi: 1, maxQi: 1 }));
    const ended = advanceBattleRound(initial, {
      seed: 1,
      params: DEFAULT_PARAMS,
      playerAction: {
        type: "perform",
        effect: { kind: "damage", type: "physical", flat: 10 },
        cost: {},
      },
      opponentAction: { type: "attack" },
    });
    expect(ended.state.winner).toBe("a");
    expect(
      advanceBattleRound(ended.state, {
        seed: 1,
        params: DEFAULT_PARAMS,
        playerAction: { type: "attack" },
        opponentAction: { type: "attack" },
      }),
    ).toEqual({ state: ended.state, events: [] });
  });

  it("1vN：玩家一动后全部存活敌人各动；清场才胜", () => {
    const initial = createBattleState(fighter("hero", { qi: 500, maxQi: 500 }), [
      fighter("dog1", { qi: 5, maxQi: 5, stats: { ...fighter("x").stats, attack: 1 } }),
      fighter("dog2", { qi: 5, maxQi: 5, stats: { ...fighter("x").stats, attack: 1 } }),
    ]);
    expect(initial.foeIds).toEqual(["b0", "b1"]);
    const first = advanceBattleRound(initial, {
      seed: 9,
      params: DEFAULT_PARAMS,
      playerAction: {
        type: "perform",
        effect: { kind: "damage", type: "physical", flat: 5 },
        cost: {},
      },
      opponentAction: { type: "attack" },
    });
    // 只打倒一只，尚未清场
    expect(first.state.winner).toBeUndefined();
    expect(aliveFoeIds(first.state).length).toBe(1);
    expect(first.events.some((e) => e.type === "foe_down")).toBe(true);
    // 双方敌人若仍存活会各攻击一次 → 至少两条敌方出手或一条（若一只已倒）
    const foeActs = first.events.filter((e) => e.actor === "b0" || e.actor === "b1");
    expect(foeActs.length).toBeGreaterThanOrEqual(1);

    const second = advanceBattleRound(first.state, {
      seed: 9,
      params: DEFAULT_PARAMS,
      playerAction: {
        type: "perform",
        effect: { kind: "damage", type: "physical", flat: 5 },
        cost: {},
      },
      opponentAction: { type: "attack" },
    });
    expect(second.state.winner).toBe("a");
    expect(aliveFoeIds(second.state)).toEqual([]);
  });

  it("自动目标：并列气量时按槽位键字典序", () => {
    const state = createBattleState(fighter("a"), [
      fighter("x", { qi: 10, maxQi: 10 }),
      fighter("y", { qi: 10, maxQi: 10 }),
    ]);
    expect(pickAutoTarget(state)).toBe("b0");
    state.combatants.b1!.qi = 3;
    expect(pickAutoTarget(state)).toBe("b1");
  });

  it("兼容旧会话 combatants.a/b 无 foeIds", () => {
    const legacy = {
      combatants: {
        a: fighter("a"),
        b: fighter("b", { qi: 1, maxQi: 1 }),
      },
      turn: 0,
      rngCalls: 0,
      nextSeq: 1,
      performCooldowns: {},
    };
    const ended = advanceBattleRound(legacy, {
      seed: 2,
      params: DEFAULT_PARAMS,
      playerAction: {
        type: "perform",
        effect: { kind: "damage", type: "physical", flat: 10 },
        cost: {},
      },
    });
    expect(ended.state.winner).toBe("a");
    expect(ended.state.foeIds).toEqual(["b"]);
  });
});

describe("createSeededRng", () => {
  it("同 seed 序列一致，不同 seed 序列不同", () => {
    const a1 = createSeededRng(123);
    const a2 = createSeededRng(123);
    const b1 = createSeededRng(456);
    expect([a1(), a1(), a1()]).toEqual([a2(), a2(), a2()]);
    expect([a1(), a1(), a1()]).not.toEqual([b1(), b1(), b1()]);
  });
});
