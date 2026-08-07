import { describe, expect, it } from "vitest";
import { computeScoreChanges } from "@yjh/game-core";
import { createApp } from "./app.js";
import { PvpError, createPvpService } from "./pvpService.js";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";

const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: {
    expCurve: { base: 100, growth: 1.1 },
    potential: { learnCostFactor: 1 },
    combat: { baseHitRate: 0.7, baseDodgeRate: 0.1, baseParryRate: 0.15 },
    afk: { maxDurationHours: 8, dailyDiminishRate: 0.5 },
    growth: {
      learnJingCostBase: 150,
      potentialCostPerLevel: 1,
      expGateExponent: 3,
      expGateDivisor: 10,
      practiceQiBase: 20,
      practiceQiPerLevel: 1,
      practicePointsPerAction: 1,
      studyJingBase: 80,
    },
    vitals: {
      qiBase: 100,
      jingBase: 100,
      jingliBase: 100,
      qiPerCon: 16,
      qiPerStr: 0,
      jingPerInt: 16,
      forceQiPerLevel: 2,
      forceJingPerLevel: 1,
      neiliPerLevel: 10,
      jingliPerLevel: 3,
      neiliToQiDiv: 4,
      neiliToJingDiv: 12,
      foodBase: 200,
      foodPerCon: 10,
      waterBase: 200,
      waterPerDex: 10,
    },
    pvp: { dailyChallengeLimit: 5, kFactor: 32, seasonWeeks: 6 },
    economy: { silverDropBase: 5, maxCashflowPerDay: 1000 },
  },
  rooms: [],
  npcs: [],
  items: [],
  skills: [],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
  name: string;
  exp: number;
  attrs: { str: number; int: number; con: number; dex: number };
}

interface SkillState {
  character_id: string;
  skill_id: string;
  level: number;
}

interface SeasonState {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

interface MatchState {
  id: string;
  season_id: string;
  challenger_id: string;
  defender_id: string;
  result: string;
  score_delta: number;
  seed: number;
  report: string;
  created_at: string;
}

interface ScoreState {
  character_id: string;
  season_id: string;
  score: number;
}

const T0 = "2026-08-07T00:00:00.000Z";
const ACTIVE_SEASON = {
  id: "season_1",
  name: "江湖论剑·第1季",
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2027-08-01T00:00:00.000Z",
  status: "active",
};

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    skills: [] as SkillState[],
    seasons: [] as SeasonState[],
    matches: [] as MatchState[],
    scores: [] as ScoreState[],
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      if (text.includes("FROM accounts WHERE invite_code")) {
        return {
          rows: state.accounts
            .filter((a) => a.invite_code === params[0])
            .map((a) => ({ id: a.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO accounts")) {
        const id = `acc_${state.accounts.length + 1}`;
        state.accounts.push({ id, invite_code: String(params[0]) });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO sessions")) {
        state.sessions.push({
          token: String(params[0]),
          account_id: String(params[1]),
          expires_at: String(params[2]),
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM sessions WHERE token")) {
        return {
          rows: state.sessions
            .filter((s) => s.token === params[0])
            .map((s) => ({ account_id: s.account_id, expires_at: s.expires_at })) as unknown as T[],
        };
      }
      // 具体 SELECT 在前（常见坑 #15）
      if (text.includes("SELECT id, name, attrs FROM characters")) {
        const rows = text.includes("WHERE account_id")
          ? state.characters.filter((c) => c.account_id === params[0] && c.status === "active")
          : state.characters.filter((c) => c.id === params[0] && c.status === "active");
        return {
          rows: rows.map((c) => ({ id: c.id, name: c.name, attrs: c.attrs })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, name, exp FROM characters") && text.includes("id <> $1")) {
        return {
          rows: state.characters
            .filter((c) => c.status === "active" && c.id !== params[0])
            .sort((a, b) => b.exp - a.exp)
            .slice(0, 10)
            .map((c) => ({ id: c.id, name: c.name, exp: c.exp })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, name, exp FROM characters") && text.includes("ORDER BY exp")) {
        return {
          rows: state.characters
            .filter((c) => c.status === "active")
            .sort((a, b) => b.exp - a.exp)
            .slice(0, 20)
            .map((c) => ({ id: c.id, name: c.name, exp: c.exp })) as unknown as T[],
        };
      }
      if (text.includes("FROM character_skills")) {
        return {
          rows: state.skills
            .filter((s) => s.character_id === params[0])
            .map((s) => ({ skill_id: s.skill_id, level: s.level })) as unknown as T[],
        };
      }
      if (text.includes("FROM tactic_templates WHERE character_id")) {
        return { rows: [] as unknown as T[] }; // 测试无默认模板 → 回退 attack-only
      }
      if (text.includes("SELECT count(*)::text AS n FROM pvp_seasons")) {
        return { rows: [{ n: String(state.seasons.length) }] as unknown as T[] };
      }
      if (text.includes("FROM pvp_seasons WHERE status = 'active'")) {
        return {
          rows: state.seasons
            .filter((s) => s.status === "active")
            .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
            .slice(0, 1)
            .map((s) => ({
              id: s.id,
              name: s.name,
              starts_at: s.starts_at,
              ends_at: s.ends_at,
              status: s.status,
            })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO pvp_seasons")) {
        const s: SeasonState = {
          id: `season_${state.seasons.length + 1}`,
          name: String(params[0]),
          starts_at: String(params[1]),
          ends_at: String(params[2]),
          status: "active",
        };
        state.seasons.push(s);
        return {
          rows: [
            {
              id: s.id,
              name: s.name,
              starts_at: s.starts_at,
              ends_at: s.ends_at,
              status: s.status,
            },
          ] as unknown as T[],
        };
      }
      if (text.includes("FROM pvp_matches WHERE challenger_id") && text.includes("count(*)")) {
        const n = state.matches.filter((m) => m.challenger_id === params[0]).length;
        return { rows: [{ n: String(n) }] as unknown as T[] };
      }
      if (text.includes("FROM pvp_scores WHERE character_id")) {
        return {
          rows: state.scores
            .filter((s) => s.character_id === params[0] && s.season_id === params[1])
            .map((s) => ({ score: s.score })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO pvp_matches")) {
        const m: MatchState = {
          id: `match_${state.matches.length + 1}`,
          season_id: String(params[0]),
          challenger_id: String(params[1]),
          defender_id: String(params[2]),
          result: String(params[6]),
          score_delta: Number(params[7]),
          seed: Number(params[5]),
          report: String(params[8]),
          created_at: T0,
        };
        state.matches.push(m);
        return { rows: [{ id: m.id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO pvp_scores")) {
        const idx = state.scores.findIndex(
          (s) => s.character_id === params[0] && s.season_id === params[1],
        );
        if (idx >= 0) state.scores[idx] = { ...state.scores[idx]!, score: Number(params[2]) };
        else
          state.scores.push({
            character_id: String(params[0]),
            season_id: String(params[1]),
            score: Number(params[2]),
          });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM pvp_matches m JOIN characters")) {
        return {
          rows: state.matches
            .filter(
              (m) =>
                m.id === params[0] &&
                (m.challenger_id === params[1] || m.defender_id === params[1]),
            )
            .map((m) => {
              const challenger = state.characters.find((c) => c.id === m.challenger_id);
              const defender = state.characters.find((c) => c.id === m.defender_id);
              return {
                id: m.id,
                result: m.result,
                score_delta: m.score_delta,
                seed: m.seed,
                report: m.report,
                created_at: m.created_at,
                challenger_name: challenger?.name ?? "?",
                defender_name: defender?.name ?? "?",
              };
            }) as unknown as T[],
        };
      }
      if (text.includes("FROM pvp_scores s JOIN characters")) {
        return {
          rows: state.scores
            .filter((s) => s.season_id === params[0])
            .map((s) => {
              const c = state.characters.find((x) => x.id === s.character_id);
              return { id: s.character_id, name: c?.name ?? "?", score: s.score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 20) as unknown as T[],
        };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot() {
  const { db, state } = mockDb();
  state.characters.push(
    {
      id: "char_a",
      account_id: "acc_a",
      status: "active",
      name: "陆小风",
      exp: 1000,
      attrs: { str: 25, int: 20, con: 20, dex: 15 },
    },
    {
      id: "char_b",
      account_id: "acc_b",
      status: "active",
      name: "花满楼",
      exp: 800,
      attrs: { str: 20, int: 25, con: 18, dex: 17 },
    },
    {
      id: "char_c",
      account_id: "acc_c",
      status: "active",
      name: "叶孤城",
      exp: 3000,
      attrs: { str: 28, int: 15, con: 22, dex: 15 },
    },
  );
  state.seasons.push({ ...ACTIVE_SEASON });
  const pvp = createPvpService(db, PACK);
  return { db, state, pvp };
}

describe("pvpService.getSeason", () => {
  it("无角色 → no_character；无活跃赛季自举创建；有则返回", async () => {
    const { pvp, state } = boot();
    await expect(pvp.getSeason("acc_x")).rejects.toMatchObject({ code: "no_character" });
    const view = await pvp.getSeason("acc_a");
    expect(view).toMatchObject({ id: "season_1", status: "active" });

    // 旧赛季已结束 → 自举新赛季（命名接续）
    state.seasons[0] = {
      ...ACTIVE_SEASON,
      status: "ended",
      ends_at: "2020-01-01T00:00:00.000Z",
    };
    const bootstrapped = await pvp.getSeason("acc_a");
    expect(bootstrapped).toMatchObject({ name: "江湖论剑·第2季", status: "active" });
    expect(state.seasons).toHaveLength(2);
  });
});

describe("pvpService.getOpponents", () => {
  it("排除自己、按经验倒序", async () => {
    const { pvp } = boot();
    const list = await pvp.getOpponents("acc_a");
    expect(list.map((o) => o.name)).toEqual(["叶孤城", "花满楼"]);
  });
});

describe("pvpService.startMatch", () => {
  it("守卫：无角色/挑战自己/对手不存在/赛季未开", async () => {
    const { pvp, state } = boot();
    await expect(pvp.startMatch("acc_x", "char_b")).rejects.toMatchObject({
      code: "no_character",
    });
    await expect(pvp.startMatch("acc_a", "char_a")).rejects.toMatchObject({
      code: "cannot_challenge_self",
    });
    await expect(pvp.startMatch("acc_a", "char_ghost")).rejects.toMatchObject({
      code: "opponent_not_found",
    });

    state.seasons[0] = {
      ...ACTIVE_SEASON,
      ends_at: "2020-01-01T00:00:00.000Z",
    };
    await expect(pvp.startMatch("acc_a", "char_b")).rejects.toMatchObject({
      code: "season_not_open",
    });
  });

  it("对战成功：写入对战记录、结算双方积分（与结果自洽）", async () => {
    const { pvp, state } = boot();
    const view = await pvp.startMatch("acc_a", "char_b");
    expect(view).toMatchObject({
      result: expect.stringMatching(/^(challenger_win|defender_win|draw)$/),
      challengerName: "陆小风",
      defenderName: "花满楼",
    });
    expect(view.seed).toBeGreaterThanOrEqual(0);

    const match = state.matches[0]!;
    expect(match).toMatchObject({
      challenger_id: "char_a",
      defender_id: "char_b",
      result: view.result,
    });
    expect(JSON.parse(match.report)).toMatchObject({ winner: view.winner, turns: view.turns });

    // 积分与结果自洽：用同一规则重算并核对
    const cScore = state.scores.find((s) => s.character_id === "char_a");
    const dScore = state.scores.find((s) => s.character_id === "char_b");
    expect(cScore).toBeDefined();
    expect(dScore).toBeDefined();
    const expected = computeScoreChanges({
      challengerScore: 0,
      defenderScore: 0,
      result: view.result,
      k: 32,
    });
    expect(cScore!.score).toBe(Math.max(0, expected.challengerDelta));
    expect(dScore!.score).toBe(Math.max(0, expected.defenderDelta));
  });

  it("每日挑战上限 → daily_limit", async () => {
    const { pvp, state } = boot();
    for (let i = 0; i < 5; i++) {
      state.matches.push({
        id: `m${i}`,
        season_id: "season_1",
        challenger_id: "char_a",
        defender_id: "char_b",
        result: "draw",
        score_delta: 0,
        seed: i,
        report: "{}",
        created_at: T0,
      });
    }
    await expect(pvp.startMatch("acc_a", "char_b")).rejects.toMatchObject({
      code: "daily_limit",
    });
  });
});

describe("pvpService.getMatch", () => {
  it("仅参与者可看战报；返回事件流", async () => {
    const { pvp, state } = boot();
    const view = await pvp.startMatch("acc_a", "char_b");
    const detail = await pvp.getMatch("acc_a", view.id);
    expect(detail).toMatchObject({ id: view.id, result: view.result, turns: view.turns });
    expect(Array.isArray(detail?.events)).toBe(true);

    // 无角色 → no_character；非参与者不可见
    await expect(pvp.getMatch("acc_x", view.id)).rejects.toMatchObject({
      code: "no_character",
    });
    expect(await pvp.getMatch("acc_c", view.id)).toBeNull();
  });
});

describe("pvpService 榜单", () => {
  it("growthLeaderboard：按经验排序", async () => {
    const { pvp } = boot();
    const lb = await pvp.growthLeaderboard("acc_a");
    expect(lb.kind).toBe("growth");
    expect(lb.entries[0]).toMatchObject({ name: "叶孤城", value: 3000, rank: 1 });
    expect(lb.entries.find((e) => e.name === "陆小风")?.isMe).toBe(true);
  });

  it("seasonLeaderboard：赛季积分榜", async () => {
    const { pvp, state } = boot();
    state.scores.push(
      { character_id: "char_c", season_id: "season_1", score: 120 },
      { character_id: "char_a", season_id: "season_1", score: 80 },
    );
    const lb = await pvp.seasonLeaderboard();
    expect(lb.kind).toBe("season_pvp");
    expect(lb.season?.id).toBe("season_1");
    expect(lb.entries[0]).toMatchObject({ name: "叶孤城", value: 120 });
    expect(lb.entries[1]).toMatchObject({ name: "陆小风", value: 80 });
  });
});

describe("app 集成（pvp/leaderboard 路由）", () => {
  it("season → opponents → match → detail 与公开榜单全链路", async () => {
    const { db, state } = mockDb();
    state.characters.push(
      {
        id: "char_a",
        account_id: "acc_1",
        status: "active",
        name: "陆小风",
        exp: 1000,
        attrs: { str: 25, int: 20, con: 20, dex: 15 },
      },
      {
        id: "char_b",
        account_id: "acc_2",
        status: "active",
        name: "花满楼",
        exp: 800,
        attrs: { str: 20, int: 25, con: 18, dex: 17 },
      },
    );
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-a", "inv-b"] });
    await app.ready();

    const loginA = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-a" },
    });
    const { token } = loginA.json() as { token: string };

    const season = await app.inject({
      method: "GET",
      url: "/pvp/season",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(season.statusCode).toBe(200);

    const opponents = await app.inject({
      method: "GET",
      url: "/pvp/opponents",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(opponents.statusCode).toBe(200);

    const match = await app.inject({
      method: "POST",
      url: "/pvp/match",
      headers: { authorization: `Bearer ${token}` },
      payload: { defenderId: "char_b" },
    });
    expect(match.statusCode).toBe(200);
    const matchView = match.json() as { id: string };
    expect(matchView.id).toBeTruthy();

    const detail = await app.inject({
      method: "GET",
      url: `/pvp/matches/${matchView.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);

    // 公开榜单（无鉴权）
    const growth = await app.inject({ method: "GET", url: "/leaderboard/growth" });
    expect(growth.statusCode).toBe(200);
    expect((growth.json() as { entries: unknown[] }).entries.length).toBeGreaterThan(0);

    const seasonLb = await app.inject({ method: "GET", url: "/leaderboard/season" });
    expect(seasonLb.statusCode).toBe(200);

    const badMatch = await app.inject({
      method: "POST",
      url: "/pvp/match",
      headers: { authorization: `Bearer ${token}` },
      payload: { defenderId: "char_a" },
    });
    expect(badMatch.statusCode).toBe(409);
    expect((badMatch.json() as { error: { code: string } }).error.code).toBe(
      "cannot_challenge_self",
    );
  });

  it("PvpError 类型存在（路由映射依赖）", () => {
    expect(PvpError).toBeDefined();
  });
});
