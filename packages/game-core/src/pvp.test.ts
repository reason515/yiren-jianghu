import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { attackOnly } from "./combat.js";
import type { Combatant } from "./combat.js";
import { createTacticSelector } from "./tactic.js";
import {
  canChallengeToday,
  computeScoreChanges,
  consumeChallenge,
  deriveMatchId,
  eloDelta,
  expectedScore,
  inSeason,
  seasonDurationMs,
  simulateMatch,
  type PvpSnapshot,
} from "./pvp.js";
import { dayKey } from "./afk.js";

const T0 = Date.UTC(2026, 7, 6, 0, 0, 0);

function combatant(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    qi: 200,
    maxQi: 200,
    jing: 100,
    maxJing: 100,
    neili: 80,
    maxNeili: 100,
    stats: { attack: 10, defense: 5, dodge: 5, parry: 5, weaponLevel: 20, forceLevel: 40 },
    ...overrides,
  };
}

function snapshot(
  id: string,
  combatant: Combatant,
  templateType: "attack" | "recover" = "attack",
): PvpSnapshot {
  const template =
    templateType === "attack"
      ? { version: 1, rules: [], defaultAction: { type: "attack" } as const }
      : {
          version: 1,
          rules: [
            {
              id: "r1",
              conditions: [{ type: "self_qi_below_pct" as const, value: 70 }],
              action: { type: "recover" as const },
            },
          ],
          defaultAction: { type: "attack" as const },
        };
  return {
    characterId: id,
    name: id,
    combatant,
    template,
    skillLevels: new Map(),
    performs: [],
  };
}

describe("simulateMatch（快照对战）", () => {
  it("确定性：同 seed 同快照 → 战报完全一致", () => {
    const mk = () =>
      simulateMatch({
        challenger: snapshot("c", combatant("c")),
        defender: snapshot("d", combatant("d")),
        seed: 42,
        params: DEFAULT_PARAMS,
      });
    expect(mk()).toEqual(mk());
  });

  it("战力悬殊 → challenger 胜（多 seed 稳定）", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulateMatch({
        challenger: snapshot(
          "c",
          combatant("c", {
            qi: 100,
            maxQi: 100,
            stats: {
              attack: 999,
              defense: 0,
              dodge: 0,
              parry: 0,
              weaponLevel: 100,
              forceLevel: 100,
            },
          }),
        ),
        defender: snapshot(
          "d",
          combatant("d", {
            qi: 60,
            maxQi: 60,
            stats: { attack: 1, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 },
          }),
        ),
        seed,
        params: DEFAULT_PARAMS,
      });
      expect(r.winner).toBe("challenger");
    }
  });

  it("防御型模板（回气）与攻击型模板在战斗中产生不同决策", () => {
    const a = simulateMatch({
      challenger: snapshot("c", combatant("c"), "attack"),
      defender: snapshot("d", combatant("d"), "recover"),
      seed: 7,
      params: DEFAULT_PARAMS,
    });
    const b = simulateMatch({
      challenger: snapshot("c", combatant("c"), "recover"),
      defender: snapshot("d", combatant("d"), "attack"),
      seed: 7,
      params: DEFAULT_PARAMS,
    });
    expect(a.events).not.toEqual(b.events);
  });

  it("maxTurns 到达 → draw", () => {
    const r = simulateMatch({
      challenger: snapshot(
        "c",
        combatant("c", {
          qi: 9999,
          maxQi: 9999,
          stats: { attack: 1, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 },
        }),
      ),
      defender: snapshot(
        "d",
        combatant("d", {
          qi: 9999,
          maxQi: 9999,
          stats: { attack: 1, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 },
        }),
      ),
      seed: 1,
      params: DEFAULT_PARAMS,
      maxTurns: 5,
    });
    expect(r.winner).toBe("draw");
    expect(r.turns).toBe(5);
  });
});

describe("ELO 积分", () => {
  it("expectedScore：同分 0.5，高分更高", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.9);
  });

  it("强胜弱得少、弱胜强得多（upset）", () => {
    const strongWins = eloDelta(1400, 1000, "win", 32);
    const upsetWins = eloDelta(1000, 1400, "win", 32);
    expect(strongWins).toBeLessThan(upsetWins);
    expect(strongWins).toBeGreaterThan(0);
    expect(upsetWins).toBeGreaterThan(strongWins);
  });

  it("computeScoreChanges：胜方正、负方负；积分守恒", () => {
    const win = computeScoreChanges({
      challengerScore: 1200,
      defenderScore: 1200,
      result: "challenger_win",
    });
    expect(win.challengerDelta).toBeGreaterThan(0);
    expect(win.defenderDelta).toBeLessThan(0);
    expect(win.challengerDelta + win.defenderDelta).toBe(0);

    const draw = computeScoreChanges({
      challengerScore: 1200,
      defenderScore: 1000,
      result: "draw",
    });
    expect(Math.abs(draw.challengerDelta)).toBeLessThan(10);
    expect(Math.abs(draw.defenderDelta)).toBeLessThan(10);
  });
});

describe("每日挑战限制", () => {
  it("限额内可挑战；满额拒绝；跨天重置", () => {
    const limit = DEFAULT_PARAMS.pvp.dailyChallengeLimit;
    let state = { day: dayKey(T0), used: 0 };
    for (let i = 0; i < limit; i++) {
      expect(canChallengeToday(state, T0, limit)).toBe(true);
      state = consumeChallenge(state, T0);
    }
    expect(canChallengeToday(state, T0, limit)).toBe(false);
    // 次日重置
    const nextDay = T0 + 24 * 3_600_000;
    expect(canChallengeToday(state, nextDay, limit)).toBe(true);
    expect(consumeChallenge(state, nextDay)).toEqual({ day: dayKey(nextDay), used: 1 });
  });
});

describe("赛季窗口", () => {
  it("窗口内为真，窗口外为假；seasonDurationMs 按周", () => {
    const window = { startsAt: T0, endsAt: T0 + seasonDurationMs(DEFAULT_PARAMS.pvp.seasonWeeks) };
    expect(inSeason(T0, window)).toBe(true);
    expect(inSeason(T0 - 1, window)).toBe(false);
    expect(inSeason(window.endsAt, window)).toBe(false);
    expect(seasonDurationMs(6)).toBe(6 * 7 * 24 * 3_600_000);
  });
});

describe("防重放匹配 id", () => {
  it("同输入同 id；不同 seed/对手不同 id", () => {
    expect(deriveMatchId("c", "d", 1)).toBe(deriveMatchId("c", "d", 1));
    expect(deriveMatchId("c", "d", 1)).not.toBe(deriveMatchId("c", "d", 2));
    expect(deriveMatchId("c", "d", 1)).not.toBe(deriveMatchId("d", "c", 1));
    expect(deriveMatchId("c", "d", 1)).toMatch(/^m_[0-9a-f]{8}$/);
  });
});
