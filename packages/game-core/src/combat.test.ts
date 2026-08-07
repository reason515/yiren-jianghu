import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import {
  advanceBattleRound,
  attackOnly,
  attackOrRecover,
  createBattleState,
  computeAttackDamage,
  dodgeRate,
  hitRate,
  parryRate,
  resolveAttack,
  runBattle,
  type BattleInput,
  type Combatant,
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
    stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 10, forceLevel: 5 },
    ...overrides,
  };
}

/** 可控 RNG：按顺序吐出预设值。 */
function stubRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

describe("命中三态与伤害（纯函数）", () => {
  it("命中率随攻击-闪避差值变化", () => {
    const a = fighter("a", { stats: { ...fighter("a").stats, attack: 20 } });
    const b = fighter("b");
    expect(hitRate(DEFAULT_PARAMS, a, b)).toBeGreaterThan(hitRate(DEFAULT_PARAMS, b, a));
  });

  it("躲闪率随防御方闪避、招架率随防御方招架增长", () => {
    const low = fighter("a");
    const high = fighter("a", {
      stats: { ...fighter("a").stats, dodge: 80, parry: 80 },
    });
    expect(dodgeRate(DEFAULT_PARAMS, high, low)).toBeGreaterThan(
      dodgeRate(DEFAULT_PARAMS, low, high),
    );
    expect(parryRate(DEFAULT_PARAMS, high, low)).toBeGreaterThan(
      parryRate(DEFAULT_PARAMS, low, high),
    );
  });

  it("伤害随攻击/等级/内功增长，受防御削减，下限 1", () => {
    const rng = stubRng([0.5]); // 无浮动
    const atk = fighter("a", {
      stats: { attack: 30, weaponLevel: 20, forceLevel: 10, defense: 0, dodge: 0, parry: 0 },
    });
    const def = fighter("b", {
      stats: { attack: 0, weaponLevel: 0, forceLevel: 0, defense: 100, dodge: 0, parry: 0 },
    });
    // base = 30 + 20*0.5 + 10*0.4 - 100*0.5 = 30+10+4-50 = -6 → 下限 1
    expect(computeAttackDamage(DEFAULT_PARAMS, atk, def, rng)).toBe(1);
    const def2 = { ...def, stats: { ...def.stats, defense: 0 } };
    expect(computeAttackDamage(DEFAULT_PARAMS, atk, def2, stubRng([0.5]))).toBe(44);
  });

  it("resolveAttack 分支：miss / dodge / parry / damage", () => {
    const p = DEFAULT_PARAMS;
    const a = fighter("a");
    const b = fighter("b");
    // rng=[0.0, ...]：命中判定 0 < hitRate → 命中；后续值控制 dodge/parry
    expect(resolveAttack(p, a, b, stubRng([0.0, 0.99, 0.99])).type).toBe("damage");
    expect(resolveAttack(p, a, b, stubRng([0.99])).type).toBe("miss");
    // dodge：命中后第二个值 0.0 < dodgeRate
    expect(resolveAttack(p, a, b, stubRng([0.0, 0.0, 0.99])).type).toBe("dodge");
    // parry：命中后 dodge 不触发、parry 触发
    const parried = resolveAttack(p, a, b, stubRng([0.0, 0.99, 0.0]));
    expect(parried.type).toBe("parry");
    if (parried.type === "parry") {
      expect(parried.damage).toBeGreaterThanOrEqual(1);
    }
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
          stats: { attack: 999, defense: 0, dodge: 0, parry: 0, weaponLevel: 100, forceLevel: 100 },
        }),
        b: fighter("b", {
          qi: 50,
          maxQi: 50,
          stats: { attack: 1, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 },
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
        stats: { attack: 1, weaponLevel: 0, forceLevel: 0, defense: 0, dodge: 0, parry: 0 },
      }),
      b: fighter("b", {
        qi: 9999,
        maxQi: 9999,
        stats: { attack: 1, weaponLevel: 0, forceLevel: 0, defense: 0, dodge: 0, parry: 0 },
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
