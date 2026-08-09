import { evalFormulaWithCoeffs, type CompiledMechanics, type Perform } from "@yjh/content";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS, type GameParams } from "./params.js";
import type { Combatant, BattleEvent } from "./combat.js";
import { runBattle } from "./combat.js";
import { createTacticSelector, type TacticTemplate } from "./tactic.js";
import { dayKey } from "./afk.js";

/**
 * C8 异步 PVP 引擎。
 *
 * - 双方为**单角色快照**（战斗数据 + 战术模板 + 绝招），无队伍/阵容；
 * - 模拟器复用 C3 runBattle + C6 模板选择器，固定种子 → 战报完全可重演；
 * - 胜负仅影响赛季积分（ELO 式），不掠夺货币/装备/成长资源；
 * - 每日挑战次数限制、赛季窗口、防重放匹配 id 一并在规则层定义（服务层落库/结算）。
 */

export interface PvpSnapshot {
  characterId: string;
  name: string;
  combatant: Combatant;
  template: TacticTemplate;
  skillLevels: Map<string, number>;
  /** 可用绝招（技能已学的绝招定义）。 */
  performs: Perform[];
}

export interface PvpMatchInput {
  challenger: PvpSnapshot;
  defender: PvpSnapshot;
  seed: number;
  params: GameParams;
  maxTurns?: number;
}

export type PvpWinner = "challenger" | "defender" | "draw";

export interface PvpMatchResult {
  winner: PvpWinner;
  events: BattleEvent[];
  turns: number;
}

/** 快照对战（确定性：同 seed 同快照 → 完全一致）。 */
export function simulateMatch(input: PvpMatchInput): PvpMatchResult {
  const performsOf = (snap: PvpSnapshot): Map<string, Perform> =>
    new Map(snap.performs.map((p) => [p.id, p]));

  const battle = runBattle({
    a: input.challenger.combatant,
    b: input.defender.combatant,
    selectors: {
      a: createTacticSelector(input.challenger.template, {
        performs: performsOf(input.challenger),
        skillLevels: input.challenger.skillLevels,
      }),
      b: createTacticSelector(input.defender.template, {
        performs: performsOf(input.defender),
        skillLevels: input.defender.skillLevels,
      }),
    },
    seed: input.seed,
    params: input.params,
    maxTurns: input.maxTurns,
  });

  const winner: PvpWinner =
    battle.winner === "a" ? "challenger" : battle.winner === "b" ? "defender" : "draw";
  return { winner, events: battle.events, turns: battle.turns };
}

// ---------- 赛季积分（ELO 式） ----------

export function expectedScore(
  scoreA: number,
  scoreB: number,
  params: GameParams = DEFAULT_PARAMS,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return evalFormulaWithCoeffs(mechanics, params, "expectedScore", { scoreA, scoreB });
}

export type EloOutcome = "win" | "loss" | "draw";

export function eloDelta(
  score: number,
  opponentScore: number,
  outcome: EloOutcome,
  k: number,
  params: GameParams = DEFAULT_PARAMS,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  const expected = expectedScore(score, opponentScore, params, mechanics);
  const s = outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
  return Math.round(k * (s - expected));
}

export interface ScoreChangeInput {
  challengerScore: number;
  defenderScore: number;
  result: "challenger_win" | "defender_win" | "draw";
  k?: number;
}

export interface ScoreChange {
  challengerDelta: number;
  defenderDelta: number;
}

/** 双方积分变动（胜方得正、负方得负；平局小幅双向）。 */
export function computeScoreChanges(input: ScoreChangeInput): ScoreChange {
  const k = input.k ?? 32;
  if (input.result === "challenger_win") {
    return {
      challengerDelta: eloDelta(input.challengerScore, input.defenderScore, "win", k),
      defenderDelta: eloDelta(input.defenderScore, input.challengerScore, "loss", k),
    };
  }
  if (input.result === "defender_win") {
    return {
      challengerDelta: eloDelta(input.challengerScore, input.defenderScore, "loss", k),
      defenderDelta: eloDelta(input.defenderScore, input.challengerScore, "win", k),
    };
  }
  return {
    challengerDelta: eloDelta(input.challengerScore, input.defenderScore, "draw", k),
    defenderDelta: eloDelta(input.defenderScore, input.challengerScore, "draw", k),
  };
}

// ---------- 每日挑战次数限制 ----------

export interface DailyChallengeState {
  day: string;
  used: number;
}

export function canChallengeToday(state: DailyChallengeState, now: number, limit: number): boolean {
  const used = state.day === dayKey(now) ? state.used : 0;
  return used < limit;
}

/** 消费一次挑战（跨天自动重置）。 */
export function consumeChallenge(state: DailyChallengeState, now: number): DailyChallengeState {
  const d = dayKey(now);
  return d === state.day ? { day: d, used: state.used + 1 } : { day: d, used: 1 };
}

// ---------- 赛季窗口 ----------

export interface SeasonWindow {
  startsAt: number;
  endsAt: number;
}

export function inSeason(now: number, window: SeasonWindow): boolean {
  return now >= window.startsAt && now < window.endsAt;
}

export function seasonDurationMs(weeks: number): number {
  return weeks * 7 * 24 * 3_600_000;
}

// ---------- 防重放匹配 id ----------

/** 匹配 id = f(challenger, defender, seed)：同输入同 id，服务层以此为幂等键防重复结算。 */
export function deriveMatchId(challengerId: string, defenderId: string, seed: number): string {
  const s = `${challengerId}|${defenderId}|${seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `m_${(h >>> 0).toString(16).padStart(8, "0")}`;
}
