import {
  canChallengeToday,
  computeMaxVitals,
  computeScoreChanges,
  inSeason,
  seasonDurationMs,
  simulateMatch,
  type PvpSnapshot,
  type TacticTemplate,
} from "@yjh/game-core";
import type { ContentPack, Perform } from "@yjh/content";
import type { Db } from "./db.js";

/** PVP/榜单域错误（code 进入错误信封）。 */
export class PvpError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PvpError";
  }
}

export interface SeasonView {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface OpponentView {
  characterId: string;
  name: string;
  exp: number;
}

export interface MatchResultView {
  id: string;
  result: "challenger_win" | "defender_win" | "draw";
  winner: string;
  turns: number;
  seed: number;
  scoreDelta: number;
  challengerName: string;
  defenderName: string;
}

export interface MatchDetailView extends MatchResultView {
  createdAt: string;
  events: unknown[];
}

export interface LeaderboardEntry {
  rank: number;
  characterId: string;
  name: string;
  value: number;
  isMe: boolean;
}

export interface LeaderboardView {
  kind: "growth" | "season_pvp";
  season?: SeasonView;
  entries: LeaderboardEntry[];
}

export interface PvpService {
  getSeason(accountId: string): Promise<SeasonView>;
  getOpponents(accountId: string): Promise<OpponentView[]>;
  startMatch(accountId: string, defenderId: string): Promise<MatchResultView>;
  getMatch(accountId: string, matchId: string): Promise<MatchDetailView | null>;
  growthLeaderboard(accountId?: string): Promise<LeaderboardView>;
  seasonLeaderboard(accountId?: string): Promise<LeaderboardView>;
}

type CharRow = {
  id: string;
  name: string;
  attrs: { str: number; int: number; con: number; dex: number };
};

const DEFAULT_TEMPLATE: TacticTemplate = {
  version: 1,
  rules: [],
  defaultAction: { type: "attack" },
};

export function createPvpService(db: Db, content: ContentPack): PvpService {
  const params = content.params;
  const skillDefs = new Map(content.skills.map((s) => [s.id, s]));

  const activeCharacter = async (accountId: string): Promise<CharRow | null> => {
    const rows = await db.query<CharRow>(
      "SELECT id, name, attrs FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    const r = rows.rows[0];
    if (!r) return null;
    return { ...r, attrs: r.attrs ?? { str: 10, int: 10, con: 10, dex: 10 } };
  };

  const characterById = async (characterId: string): Promise<CharRow | null> => {
    const rows = await db.query<CharRow>(
      "SELECT id, name, attrs FROM characters WHERE id = $1 AND status = 'active'",
      [characterId],
    );
    const r = rows.rows[0];
    if (!r) return null;
    return { ...r, attrs: r.attrs ?? { str: 10, int: 10, con: 10, dex: 10 } };
  };

  const getSeasonRow = async (): Promise<SeasonView> => {
    const rows = await db.query<{
      id: string;
      name: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(
      "SELECT id, name, starts_at, ends_at, status FROM pvp_seasons WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1",
      [],
    );
    const row = rows.rows[0];
    if (row) {
      return {
        id: row.id,
        name: row.name,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
      };
    }
    // 引导：无活跃赛季时自举一个（服务层幂等；正式赛季编排在 G 阶段）
    const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM pvp_seasons", []);
    const n = Number(count.rows[0]?.n ?? 0) + 1;
    const now = Date.now();
    const created = await db.query<{
      id: string;
      name: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(
      "INSERT INTO pvp_seasons (name, starts_at, ends_at, status) VALUES ($1, $2, $3, 'active') RETURNING id, name, starts_at, ends_at, status",
      [
        `江湖论剑·第${n}季`,
        new Date(now).toISOString(),
        new Date(now + seasonDurationMs(params.pvp.seasonWeeks)).toISOString(),
      ],
    );
    const c = created.rows[0]!;
    return {
      id: c.id,
      name: c.name,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      status: c.status,
    };
  };

  const skillsOf = async (characterId: string): Promise<Map<string, number>> => {
    const rows = await db.query<{ skill_id: string; level: number }>(
      "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
      [characterId],
    );
    return new Map(rows.rows.map((r) => [r.skill_id, r.level]));
  };

  const learnedPerformsOf = (skillLevels: Map<string, number>): Perform[] =>
    content.performs.filter((p) => (skillLevels.get(p.skillId) ?? 0) > 0);

  const defaultPvpTemplateOf = async (characterId: string): Promise<TacticTemplate> => {
    const rows = await db.query<{ config: string | TacticTemplate }>(
      "SELECT config FROM tactic_templates WHERE character_id = $1 AND is_default_pvp = true ORDER BY updated_at DESC LIMIT 1",
      [characterId],
    );
    const row = rows.rows[0];
    if (!row) return DEFAULT_TEMPLATE;
    return typeof row.config === "string" ? (JSON.parse(row.config) as TacticTemplate) : row.config;
  };

  /**
   * PVP 快照构造（占位公式，随 F 阶段战斗域统一）：
   * 气血/精神/内力上限走 C2 computeMaxVitals（真公式）；攻击/防御/闪避/招架为
   * 属性 + 对应门类武功等级的线性占位——双方同构，保证异步对战的公平基线。
   */
  const buildSnapshot = async (char: CharRow, template: TacticTemplate): Promise<PvpSnapshot> => {
    const skillLevels = await skillsOf(char.id);
    const levelsByCategory = new Map<string, number>();
    for (const [skillId, level] of skillLevels) {
      const def = skillDefs.get(skillId);
      if (!def) continue;
      levelsByCategory.set(def.category, Math.max(levelsByCategory.get(def.category) ?? 0, level));
    }
    const weaponLevel = levelsByCategory.get("weapon") ?? 0;
    const forceLevel = levelsByCategory.get("force") ?? 0;
    const dodgeLevel = levelsByCategory.get("dodge") ?? 0;
    const parryLevel = levelsByCategory.get("parry") ?? 0;

    const maxVitals = computeMaxVitals(params, {
      str: char.attrs.str,
      int: char.attrs.int,
      con: char.attrs.con,
      dex: char.attrs.dex,
      forceLevel,
    });

    return {
      characterId: char.id,
      name: char.name,
      combatant: {
        id: char.id,
        name: char.name,
        qi: maxVitals.maxQi,
        maxQi: maxVitals.maxQi,
        jing: maxVitals.maxJing,
        maxJing: maxVitals.maxJing,
        neili: maxVitals.maxNeili,
        maxNeili: maxVitals.maxNeili,
        stats: {
          attack: 10 + char.attrs.str + weaponLevel * 2,
          defense: 10 + char.attrs.con,
          dodge: 5 + char.attrs.dex + dodgeLevel,
          parry: 5 + parryLevel,
          weaponLevel,
          forceLevel,
        },
      },
      template,
      skillLevels,
      performs: learnedPerformsOf(skillLevels),
    };
  };

  const scoreOf = async (characterId: string, seasonId: string): Promise<number> => {
    const rows = await db.query<{ score: number }>(
      "SELECT score FROM pvp_scores WHERE character_id = $1 AND season_id = $2",
      [characterId, seasonId],
    );
    return rows.rows[0]?.score ?? 0;
  };

  return {
    async getSeason(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new PvpError("no_character", "尚未立名闯江湖");
      return getSeasonRow();
    },

    async getOpponents(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new PvpError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{ id: string; name: string; exp: number }>(
        "SELECT id, name, exp FROM characters WHERE status = 'active' AND id <> $1 ORDER BY exp DESC LIMIT 10",
        [ch.id],
      );
      return rows.rows.map((r) => ({ characterId: r.id, name: r.name, exp: r.exp }));
    },

    async startMatch(accountId, defenderId) {
      const challenger = await activeCharacter(accountId);
      if (!challenger) throw new PvpError("no_character", "尚未立名闯江湖");
      if (defenderId === challenger.id) {
        throw new PvpError("cannot_challenge_self", "江湖人不与己身论剑");
      }
      const defender = await characterById(defenderId);
      if (!defender) throw new PvpError("opponent_not_found", "对手已不在江湖（角色不存在）");

      const season = await getSeasonRow();
      const now = Date.now();
      if (
        !inSeason(now, { startsAt: Date.parse(season.startsAt), endsAt: Date.parse(season.endsAt) })
      ) {
        throw new PvpError("season_not_open", "论剑时节未至，且待来日");
      }

      const dayStart = new Date(new Date(now).toISOString().slice(0, 10)).getTime();
      const usedRows = await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pvp_matches WHERE challenger_id = $1 AND created_at >= $2",
        [challenger.id, new Date(dayStart).toISOString()],
      );
      const used = Number(usedRows.rows[0]?.n ?? 0);
      if (
        !canChallengeToday(
          { day: new Date(now).toISOString().slice(0, 10), used },
          now,
          params.pvp.dailyChallengeLimit,
        )
      ) {
        throw new PvpError("daily_limit", "今日论剑之数已尽，明日再来");
      }

      const [cTemplate, dTemplate] = await Promise.all([
        defaultPvpTemplateOf(challenger.id),
        defaultPvpTemplateOf(defender.id),
      ]);
      const challengerSnapshot = await buildSnapshot(challenger, cTemplate);
      const defenderSnapshot = await buildSnapshot(defender, dTemplate);

      const seed = Math.floor(Math.random() * 0x7fffffff);
      const sim = simulateMatch({
        challenger: challengerSnapshot,
        defender: defenderSnapshot,
        seed,
        params,
      });

      const cScore = await scoreOf(challenger.id, season.id);
      const dScore = await scoreOf(defender.id, season.id);
      const result =
        sim.winner === "challenger"
          ? "challenger_win"
          : sim.winner === "defender"
            ? "defender_win"
            : "draw";
      const deltas = computeScoreChanges({
        challengerScore: cScore,
        defenderScore: dScore,
        result,
        k: params.pvp.kFactor,
      });
      const cNew = Math.max(0, cScore + deltas.challengerDelta);
      const dNew = Math.max(0, dScore + deltas.defenderDelta);

      const report = {
        events: sim.events,
        turns: sim.turns,
        winner: sim.winner,
        challengerDelta: deltas.challengerDelta,
        defenderDelta: deltas.defenderDelta,
      };
      const inserted = await db.query<{ id: string }>(
        "INSERT INTO pvp_matches (season_id, challenger_id, defender_id, challenger_snapshot, defender_snapshot, seed, result, score_delta, report) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [
          season.id,
          challenger.id,
          defender.id,
          JSON.stringify(challengerSnapshot),
          JSON.stringify(defenderSnapshot),
          seed,
          result,
          deltas.challengerDelta,
          JSON.stringify(report),
        ],
      );
      const matchId = inserted.rows[0]!.id;
      await db.query(
        "INSERT INTO pvp_scores (character_id, season_id, score) VALUES ($1, $2, $3) ON CONFLICT (character_id, season_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now()",
        [challenger.id, season.id, cNew],
      );
      await db.query(
        "INSERT INTO pvp_scores (character_id, season_id, score) VALUES ($1, $2, $3) ON CONFLICT (character_id, season_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now()",
        [defender.id, season.id, dNew],
      );

      return {
        id: matchId,
        result,
        winner: sim.winner,
        turns: sim.turns,
        seed,
        scoreDelta: deltas.challengerDelta,
        challengerName: challenger.name,
        defenderName: defender.name,
      };
    },

    async getMatch(accountId, matchId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new PvpError("no_character", "尚未立名闯江湖");
      const rows = await db.query<{
        id: string;
        result: "challenger_win" | "defender_win" | "draw";
        score_delta: number;
        seed: number;
        report: string;
        created_at: string;
        challenger_name: string;
        defender_name: string;
      }>(
        "SELECT m.id, m.result, m.score_delta, m.seed, m.report, m.created_at, c1.name AS challenger_name, c2.name AS defender_name FROM pvp_matches m JOIN characters c1 ON c1.id = m.challenger_id JOIN characters c2 ON c2.id = m.defender_id WHERE m.id = $1 AND (m.challenger_id = $2 OR m.defender_id = $2)",
        [matchId, ch.id],
      );
      const row = rows.rows[0];
      if (!row) return null;
      const report = JSON.parse(row.report) as { events: unknown[]; turns: number; winner: string };
      return {
        id: row.id,
        result: row.result,
        winner: report.winner,
        turns: report.turns,
        seed: row.seed,
        scoreDelta: row.score_delta,
        challengerName: row.challenger_name,
        defenderName: row.defender_name,
        createdAt: row.created_at,
        events: report.events,
      };
    },

    async growthLeaderboard(accountId?: string) {
      const me = accountId ? await activeCharacter(accountId) : null;
      const rows = await db.query<{ id: string; name: string; exp: number }>(
        "SELECT id, name, exp FROM characters WHERE status = 'active' ORDER BY exp DESC LIMIT 20",
        [],
      );
      return {
        kind: "growth",
        entries: rows.rows.map((r, i) => ({
          rank: i + 1,
          characterId: r.id,
          name: r.name,
          value: r.exp,
          isMe: me?.id === r.id,
        })),
      };
    },

    async seasonLeaderboard(accountId?: string) {
      const me = accountId ? await activeCharacter(accountId) : null;
      const season = await getSeasonRow();
      const rows = await db.query<{ id: string; name: string; score: number }>(
        "SELECT c.id, c.name, s.score FROM pvp_scores s JOIN characters c ON c.id = s.character_id WHERE s.season_id = $1 ORDER BY s.score DESC LIMIT 20",
        [season.id],
      );
      return {
        kind: "season_pvp",
        season: {
          id: season.id,
          name: season.name,
          status: season.status,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
        },
        entries: rows.rows.map((r, i) => ({
          rank: i + 1,
          characterId: r.id,
          name: r.name,
          value: r.score,
          isMe: me?.id === r.id,
        })),
      };
    },
  };
}
