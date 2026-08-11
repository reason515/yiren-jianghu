import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@yjh/shared";
import { createApp } from "./app.js";
import { SessionError, createSessionService } from "./sessionService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

interface CharState {
  id: string;
  account_id: string;
  status: string;
  name: string;
  gender: string;
  room_path: string;
  exp: number;
  potential: number;
  learned_points: number;
  silver: number;
  qi: number;
  jing: number;
  jingli: number;
  neili: number;
  food: number;
  water: number;
  eff_qi?: number;
  eff_jing?: number;
  attrs?: Record<string, unknown> | string | null;
  last_heal_at?: string | null;
}

interface AfkState {
  id: string;
  character_id: string;
  kind: string;
  status: string;
  stop_reason: string | null;
  read_at: string | null;
  updated_at: string;
}

interface MatchState {
  id: string;
  challenger_id: string;
  defender_id: string;
  result: string | null;
  read_at: string | null;
  created_at: string;
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    afk: [] as AfkState[],
    matches: [] as MatchState[],
    skills: [] as Array<{ id: string; character_id: string; skill_id: string; level: number }>,
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
      if (text.includes("SELECT skill_id, level FROM character_skills")) {
        return {
          rows: state.skills
            .filter((skill) => skill.character_id === params[0])
            .map((skill) => ({ skill_id: skill.skill_id, level: skill.level })) as unknown as T[],
        };
      }
      if (text.includes("eff_qi, eff_jing, attrs, last_heal_at")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              qi: c.qi,
              jing: c.jing,
              jingli: c.jingli,
              neili: c.neili,
              food: c.food,
              water: c.water,
              eff_qi: c.eff_qi ?? c.qi,
              eff_jing: c.eff_jing ?? c.jing,
              attrs: c.attrs ?? null,
              last_heal_at: c.last_heal_at ?? new Date().toISOString(),
            })) as unknown as T[],
        };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, jingli = $3, neili = $4, food = $5, water = $6, eff_qi = $7, eff_jing = $8",
        )
      ) {
        const character = state.characters.find((c) => c.id === params[8]);
        if (character) {
          character.qi = Number(params[0]);
          character.jing = Number(params[1]);
          character.jingli = Number(params[2]);
          character.neili = Number(params[3]);
          character.food = Number(params[4]);
          character.water = Number(params[5]);
          character.eff_qi = Number(params[6]);
          character.eff_jing = Number(params[7]);
          character.last_heal_at = new Date().toISOString();
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE characters SET last_heal_at = now()")) {
        const character = state.characters.find((c) => c.id === params[0]);
        if (character) character.last_heal_at = new Date().toISOString();
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT id, name, gender, status, room_path, exp, potential")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              name: c.name,
              gender: c.gender,
              status: c.status,
              room_path: c.room_path,
              exp: c.exp,
              potential: c.potential,
              learned_points: c.learned_points,
              silver: c.silver,
              qi: c.qi,
              jing: c.jing,
              jingli: c.jingli,
              neili: c.neili,
              food: c.food,
              water: c.water,
              attrs: c.attrs,
            })) as unknown as T[],
        };
      }
      if (text.includes("FROM afk_jobs WHERE character_id") && text.includes("read_at IS NULL")) {
        return {
          rows: state.afk
            .filter(
              (a) =>
                a.character_id === params[0] &&
                (a.status === "completed" || a.status === "failed") &&
                a.read_at == null,
            )
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 20)
            .map((a) => ({
              id: a.id,
              kind: a.kind,
              status: a.status,
              stop_reason: a.stop_reason,
            })) as unknown as T[],
        };
      }
      if (text.includes("UPDATE afk_jobs SET read_at")) {
        const ids = params[0] as string[];
        for (const a of state.afk) {
          if (ids.includes(a.id)) a.read_at = "2026-08-07T01:00:00.000Z";
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM pvp_matches WHERE") && text.includes("read_at IS NULL")) {
        return {
          rows: state.matches
            .filter(
              (m) =>
                (m.challenger_id === params[0] || m.defender_id === params[0]) &&
                m.result != null &&
                m.read_at == null,
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 20)
            .map((m) => ({ id: m.id })) as unknown as T[],
        };
      }
      if (text.includes("UPDATE pvp_matches SET read_at")) {
        const ids = params[0] as string[];
        for (const m of state.matches) {
          if (ids.includes(m.id)) m.read_at = "2026-08-07T01:00:00.000Z";
        }
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot() {
  const { db, state } = mockDb();
  state.characters.push({
    id: "char_1",
    account_id: "acc_1",
    status: "active",
    name: "陆小风",
    gender: "male",
    room_path: "village_square",
    exp: 1500,
    potential: 120,
    learned_points: 40,
    silver: 66,
    qi: 300,
    jing: 200,
    jingli: 100,
    neili: 50,
    food: 180,
    water: 160,
  });
  const session = createSessionService(db);
  return { db, state, session };
}

/** 最小内容包 stub：默认 params + 技能表（computeMaxVitals 读公式）。 */
const CONTENT = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  skills: [{ id: "xuanmen_force", name: "玄门心法", category: "force" }],
} as unknown as ContentPack;

describe("sessionService.resume", () => {
  it("无角色：character 为 null、空未读、stateVersion=协议版本", async () => {
    const { session } = boot();
    const res = await session.resume("acc_x");
    expect(res).toEqual({
      stateVersion: PROTOCOL_VERSION,
      character: null,
      pendingAfkReports: [],
      pendingPvpReportIds: [],
    });
  });

  it("角色快照：含 vitals/位置/有效潜能", async () => {
    const { session } = boot();
    const res = await session.resume("acc_1");
    expect(res.stateVersion).toBe(PROTOCOL_VERSION);
    expect(res.character).toMatchObject({
      id: "char_1",
      name: "陆小风",
      roomPath: "village_square",
      exp: 1500,
      effectivePotential: 80, // 120 − 40
      silver: 66,
      vitals: { qi: 300, jing: 200, jingli: 100, neili: 50, food: 180, water: 160 },
    });
  });

  it("返回生存资源上限（与当前值成对，供顶栏展示）", async () => {
    const { db, state } = boot();
    // 无 attrs 时按 0 计算：maxQi = 100 + 0 + 0 = 100；
    // 再给角色补 attrs 与内功等级验证公式生效
    state.characters[0]!.attrs = { str: 25, int: 20, con: 20, dex: 15 };
    state.skills.push({ id: "cs_1", character_id: "char_1", skill_id: "xuanmen_force", level: 10 });
    const withContent = createSessionService(db, CONTENT);
    const res = await withContent.resume("acc_1");
    // maxNeili = 10*8 = 80；maxJingli = 50 + 10*2 = 70；
    // maxQi = 50 + 20*8 + 10*1 + floor(80/4) = 50+160+10+20 = 240
    expect(res.character?.vitalsMax).toEqual({
      qi: 240,
      jing: 50 + 20 * 8 + 10 * 1 + Math.floor(80 / 12),
      jingli: 70,
      neili: 80,
      food: 100 + 20 * 5,
      water: 100 + 15 * 5,
    });
  });

  it("返回断线期间未读战报并置已读（二次 resume 不再返回）", async () => {
    const { session, state } = boot();
    state.afk.push(
      {
        id: "job_1",
        character_id: "char_1",
        kind: "quest",
        status: "completed",
        stop_reason: "时长上限",
        read_at: null,
        updated_at: "2026-08-07T02:00:00.000Z",
      },
      {
        id: "job_2",
        character_id: "char_1",
        kind: "study",
        status: "failed",
        stop_reason: "气机不继",
        read_at: null,
        updated_at: "2026-08-07T03:00:00.000Z",
      },
      {
        id: "job_read",
        character_id: "char_1",
        kind: "study",
        status: "completed",
        stop_reason: "时长上限",
        read_at: "2026-08-07T00:30:00.000Z",
        updated_at: "2026-08-07T00:40:00.000Z",
      },
    );
    state.matches.push(
      {
        id: "match_1",
        challenger_id: "char_1",
        defender_id: "char_2",
        result: "challenger_win",
        read_at: null,
        created_at: "2026-08-07T02:00:00.000Z",
      },
      {
        id: "match_2",
        challenger_id: "char_3",
        defender_id: "char_1",
        result: "draw",
        read_at: null,
        created_at: "2026-08-07T02:30:00.000Z",
      },
      {
        id: "match_read",
        challenger_id: "char_1",
        defender_id: "char_2",
        result: "defender_win",
        read_at: "2026-08-07T01:00:00.000Z",
        created_at: "2026-08-07T01:30:00.000Z",
      },
    );

    const res = await session.resume("acc_1");
    expect(res.pendingAfkReports).toHaveLength(2);
    expect(res.pendingAfkReports[0]).toMatchObject({ jobId: "job_2", status: "failed" });
    expect(res.pendingAfkReports[1]).toMatchObject({ jobId: "job_1", kind: "quest" });
    expect(res.pendingPvpReportIds).toEqual(["match_2", "match_1"]);
    // 已置已读
    expect(state.afk.find((a) => a.id === "job_1")?.read_at).toBeTruthy();
    expect(state.matches.find((m) => m.id === "match_1")?.read_at).toBeTruthy();
    expect(state.afk.find((a) => a.id === "job_read")?.read_at).toBeTruthy(); // 原已读不动

    // 二次 resume：未读已清空
    const again = await session.resume("acc_1");
    expect(again.pendingAfkReports).toHaveLength(0);
    expect(again.pendingPvpReportIds).toHaveLength(0);
  });
});

describe("app 集成（session 路由）", () => {
  it("GET /session/resume 全链路（无角色→有角色）", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };

    // 无角色：character null
    const empty = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { character: unknown }).character).toBeNull();

    state.characters.push({
      id: "char_1",
      account_id: "acc_1",
      status: "active",
      name: "陆小风",
      gender: "male",
      room_path: "village_start",
      exp: 100,
      potential: 20,
      learned_points: 0,
      silver: 10,
      qi: 200,
      jing: 150,
      jingli: 80,
      neili: 0,
      food: 150,
      water: 140,
    });
    const res = await app.inject({
      method: "GET",
      url: "/session/resume",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { character: { name: string } }).character.name).toBe("陆小风");
  });

  it("SessionError 类型存在（路由映射依赖）", () => {
    expect(SessionError).toBeDefined();
  });
});
