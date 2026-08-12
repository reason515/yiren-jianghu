import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { AfkError, createAfkService } from "./afkService.js";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";

const PACK = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [{ id: "wild_dog", name: "野狗", kind: "battle", skills: [], battleRewards: {} }],
  items: [],
  skills: [
    {
      id: "basic_sword",
      name: "基础剑法",
      kind: "basic",
      category: "sword",
      enableSlots: [],
      maxLevel: 100,
    },
  ],
  performs: [],
  quests: [
    {
      id: "q_hunt",
      name: "试剑",
      kind: "bounty",
      minExp: 0,
      briefing: "试剑",
      phases: [{ type: "kill", targetId: "wild_dog", count: 1 }],
      rewards: { exp: 0, potential: 0, silver: 0, items: [] },
      repeatable: true,
    },
  ],
  story: [],
  grindJobs: [
    {
      id: "village_chore",
      name: "村中杂役",
      description: "劈柴挑水",
      maxExp: 2000,
      hourlyGain: { exp: 36, potential: 18, silver: 8 },
      jingPerHour: 12,
    },
  ],
} as unknown as ContentPack;

interface CharState {
  id: string;
  account_id: string;
  status: string;
  exp?: number;
  room_path?: string;
  jing?: number;
}

interface TplState {
  id: string;
  character_id: string;
  config: string;
}

interface JobState {
  id: string;
  character_id: string;
  kind: string;
  status: string;
  phase: string;
  presence: string;
  template_id: string | null;
  template_snapshot: string;
  config: string;
  day: string;
  hours_today: number;
  started_at: string;
  scheduled_end_at: string;
  last_tick_at: string | null;
  last_heartbeat_at: string | null;
  journal_seq: number;
  stop_reason: string | null;
  report: string | null;
  updated_at: string;
}

const T0 = "2026-08-07T00:00:00.000Z";

function mapJobRow(j: JobState) {
  return {
    id: j.id,
    character_id: j.character_id,
    kind: j.kind,
    status: j.status,
    phase: j.phase,
    presence: j.presence,
    template_snapshot: JSON.parse(j.template_snapshot),
    config: JSON.parse(j.config),
    day: j.day,
    hours_today: j.hours_today,
    started_at: j.started_at,
    scheduled_end_at: j.scheduled_end_at,
    last_tick_at: j.last_tick_at,
    last_heartbeat_at: j.last_heartbeat_at,
    journal_seq: j.journal_seq,
    stop_reason: j.stop_reason,
    report: j.report,
  };
}

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    templates: [] as TplState[],
    jobs: [] as JobState[],
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
      if (
        text.includes("SELECT id, exp, room_path FROM characters") ||
        text.includes("SELECT id, exp FROM characters") ||
        text.includes("SELECT id FROM characters")
      ) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({
              id: c.id,
              exp: c.exp ?? 0,
              room_path: c.room_path ?? "village_square",
            })) as unknown as T[],
        };
      }
      if (text.includes("SELECT room_path FROM characters WHERE id")) {
        const c = state.characters.find((ch) => ch.id === params[0]);
        return {
          rows: (c ? [{ room_path: c.room_path ?? "village_square" }] : []) as unknown as T[],
        };
      }
      if (text.includes("FROM character_quests WHERE character_id = $1 AND quest_id = $2")) {
        return {
          rows:
            params[1] === "q_hunt"
              ? ([{ status: "accepted", progress: { phase: 0, counts: {} } }] as unknown as T[])
              : ([] as T[]),
        };
      }
      if (text.includes("SELECT id, config FROM tactic_templates")) {
        return {
          rows: state.templates
            .filter((t) => t.id === params[0] && t.character_id === params[1])
            .map((t) => ({ id: t.id, config: t.config })) as unknown as T[],
        };
      }
      if (text.includes("FROM afk_jobs WHERE id = $1") && text.includes("FOR UPDATE")) {
        const job = state.jobs.find(
          (j) => j.id === params[0] && (j.status === "running" || j.status === "paused"),
        );
        return { rows: (job ? [mapJobRow(job)] : []) as unknown as T[] };
      }
      if (text.includes("FROM afk_jobs WHERE id = $1") && !text.includes("character_id")) {
        const job = state.jobs.find((j) => j.id === params[0]);
        return { rows: (job ? [mapJobRow(job)] : []) as unknown as T[] };
      }
      if (
        text.includes("FROM afk_jobs WHERE character_id") &&
        text.includes("'running','paused'")
      ) {
        return {
          rows: state.jobs
            .filter(
              (j) =>
                j.character_id === params[0] && (j.status === "running" || j.status === "paused"),
            )
            .sort((a, b) => b.started_at.localeCompare(a.started_at))
            .slice(0, 1)
            .map((j) => mapJobRow(j)) as unknown as T[],
        };
      }
      if (text.includes("FROM afk_jobs WHERE character_id") && text.includes("LIMIT $2")) {
        const n = Number(params[1]);
        return {
          rows: state.jobs
            .filter((j) => j.character_id === params[0])
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, n)
            .map((j) => mapJobRow(j)) as unknown as T[],
        };
      }
      if (text.includes("SELECT jing, exp, room_path FROM characters")) {
        const c = state.characters.find((ch) => ch.id === params[0]);
        return {
          rows: [
            {
              jing: c?.jing ?? 100,
              exp: c?.exp ?? 0,
              room_path: c?.room_path ?? "village_square",
            },
          ] as unknown as T[],
        };
      }
      if (
        text.includes("SELECT jing, exp FROM characters") ||
        text.includes("SELECT jing FROM characters")
      ) {
        const c = state.characters.find((ch) => ch.id === params[0]);
        return {
          rows: [{ jing: c?.jing ?? 100, exp: c?.exp ?? 0 }] as unknown as T[],
        };
      }
      if (text.includes("UPDATE characters SET room_path")) {
        const c = state.characters.find((ch) => ch.id === params[1]);
        if (c) c.room_path = String(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (
        text.includes("UPDATE afk_jobs SET phase = $1") &&
        text.includes("config = $2") &&
        text.includes("last_tick_at = $3")
      ) {
        const job = state.jobs.find((j) => j.id === params[3]);
        if (job) {
          job.phase = String(params[0]);
          job.config = String(params[1]);
          job.last_tick_at = String(params[2]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM character_skills WHERE character_id")) {
        return {
          rows: [{ skill_id: "basic_sword", level: 1, practice_points: 0 }] as unknown as T[],
        };
      }
      if (text.includes("UPDATE characters SET jing")) {
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("INSERT INTO character_skills") || text.includes("ON CONFLICT")) {
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET last_heartbeat_at")) {
        const job = state.jobs.find((j) => j.id === params[1]);
        if (job) job.last_heartbeat_at = String(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET journal_seq")) {
        const job = state.jobs.find((j) => j.id === params[1]);
        if (job) job.journal_seq += Number(params[0]);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET status = 'cancelled'")) {
        const job = state.jobs.find((j) => j.id === params[5]);
        if (job) {
          job.status = "cancelled";
          job.phase = String(params[0]);
          job.config = String(params[1]);
          job.last_tick_at = String(params[2]);
          job.report = String(params[3]);
          job.stop_reason = String(params[4]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET phase = 'work'")) {
        const job = state.jobs.find((j) => j.id === params[4]);
        if (job) {
          job.phase = "work";
          job.day = String(params[0]);
          job.hours_today = Number(params[1]);
          job.config = String(params[2]);
          job.last_tick_at = String(params[3]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET phase = 'fight'")) {
        const job = state.jobs.find((j) => j.id === params[2]);
        if (job) {
          job.phase = "fight";
          job.config = String(params[0]);
          job.last_tick_at = String(params[1]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET status = $1") && text.includes("hours_today = $4")) {
        const job = state.jobs.find((j) => j.id === params[7]);
        if (job) {
          job.status = String(params[0]);
          job.phase = String(params[1]);
          job.day = String(params[2]);
          job.hours_today = Number(params[3]);
          job.last_tick_at = String(params[4]);
          job.report = params[5] ? String(params[5]) : null;
          job.stop_reason = params[6] ? String(params[6]) : null;
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET status = $1") && text.includes("config = $3")) {
        const job = state.jobs.find((j) => j.id === params[6]);
        if (job) {
          job.status = String(params[0]);
          job.phase = String(params[1]);
          job.config = String(params[2]);
          job.last_tick_at = String(params[3]);
          job.report = params[4] ? String(params[4]) : null;
          job.stop_reason = params[5] ? String(params[5]) : null;
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("UPDATE afk_jobs SET status = 'paused'")) {
        const job = state.jobs.find((j) => j.id === params[2]);
        if (job) {
          job.status = "paused";
          job.stop_reason = String(params[0]);
          job.last_tick_at = String(params[1]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (
        text.includes("UPDATE afk_jobs SET status = 'running'") &&
        text.includes("stop_reason = NULL")
      ) {
        const job = state.jobs.find((j) => j.id === params[1]);
        if (job) {
          job.status = "running";
          job.stop_reason = null;
          job.last_tick_at = String(params[0]);
          job.last_heartbeat_at = String(params[0]);
        }
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("INSERT INTO afk_jobs")) {
        state.jobs.push({
          id: String(params[0]),
          character_id: String(params[1]),
          kind: String(params[2]),
          presence: String(params[3]),
          status: "running",
          phase: "init",
          template_id: params[4] ? String(params[4]) : null,
          template_snapshot: String(params[5]),
          config: String(params[6]),
          day: String(params[7]),
          hours_today: 0,
          started_at: String(params[8]),
          scheduled_end_at: String(params[9]),
          last_tick_at: String(params[8]),
          last_heartbeat_at: String(params[8]),
          journal_seq: 0,
          stop_reason: null,
          report: null,
          updated_at: T0,
        });
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot() {
  const { db, state } = mockDb();
  state.characters.push({ id: "char_1", account_id: "acc_1", status: "active" });
  const afk = createAfkService(db, PACK);
  return { db, state, afk };
}

describe("afkService.start", () => {
  it("练功挂机：写入 running 作业并返回视图", async () => {
    const { afk, state } = boot();
    const view = await afk.start("acc_1", {
      kind: "practice",
      config: { skillId: "basic_sword" },
      durationMinutes: 60,
    });
    expect(view).toMatchObject({ kind: "practice", status: "running", phase: "init" });
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]).toMatchObject({
      character_id: "char_1",
      kind: "practice",
      status: "running",
    });
    expect(JSON.parse(state.jobs[0]!.config)).toMatchObject({ skillId: "basic_sword" });
    expect(view.scheduledEndAt).not.toBe(view.startedAt);
  });

  it("行侠挂机：必填模板并固化快照；缺模板 → template_required", async () => {
    const { afk, state } = boot();
    state.templates.push({
      id: "tpl_1",
      character_id: "char_1",
      config: JSON.stringify({ version: 1, rules: [], defaultAction: { type: "attack" } }),
    });
    await expect(afk.start("acc_1", { kind: "quest", durationMinutes: 30 })).rejects.toMatchObject({
      code: "template_required",
    });

    state.jobs = [];

    const view = await afk.start("acc_1", {
      kind: "quest",
      templateId: "tpl_1",
      durationMinutes: 30,
      config: { questId: "q_hunt" },
    });
    expect(view.kind).toBe("quest");
    expect(state.jobs[0]?.template_id).toBe("tpl_1");
    expect(JSON.parse(state.jobs[0]!.template_snapshot)).toEqual({
      version: 1,
      rules: [],
      defaultAction: { type: "attack" },
    });
  });

  it("生计挂机：择杂役即可；历练超限拒绝", async () => {
    const { afk, state } = boot();
    const view = await afk.start("acc_1", {
      kind: "grind",
      durationMinutes: 60,
      config: { jobId: "village_chore" },
    });
    expect(view.kind).toBe("grind");
    expect(JSON.parse(state.jobs[0]!.config)).toMatchObject({ jobId: "village_chore" });

    state.jobs = [];
    state.characters[0]!.exp = 2000;
    await expect(
      afk.start("acc_1", {
        kind: "grind",
        durationMinutes: 60,
        config: { jobId: "village_chore" },
      }),
    ).rejects.toMatchObject({ code: "grind_unavailable" });

    const jobs = await afk.grindJobs("acc_1");
    expect(jobs).toEqual([]);
  });

  it("非法参数：kind/时长/武功/模板归属", async () => {
    const { afk, state } = boot();
    await expect(afk.start("acc_1", { kind: "fishing" as never })).rejects.toMatchObject({
      code: "invalid_kind",
    });
    await expect(
      afk.start("acc_1", {
        kind: "practice",
        durationMinutes: 0,
        config: { skillId: "basic_sword" },
      }),
    ).rejects.toMatchObject({ code: "invalid_duration" });
    await expect(
      afk.start("acc_1", {
        kind: "practice",
        durationMinutes: 9999,
        config: { skillId: "basic_sword" },
      }),
    ).rejects.toMatchObject({ code: "invalid_duration" });
    await expect(
      afk.start("acc_1", {
        kind: "practice",
        durationMinutes: 30,
        config: { skillId: "ghost_art" },
      }),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await expect(
      afk.start("acc_1", { kind: "quest", templateId: "tpl_x", durationMinutes: 30 }),
    ).rejects.toMatchObject({ code: "not_found" });

    state.templates.push({ id: "tpl_2", character_id: "char_other", config: "{}" });
    await expect(
      afk.start("acc_1", { kind: "quest", templateId: "tpl_2", durationMinutes: 30 }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      afk.start("acc_x", { kind: "practice", config: { skillId: "basic_sword" } }),
    ).rejects.toMatchObject({ code: "no_character" });
  });

  it("已有挂机 → already_running", async () => {
    const { afk, state } = boot();
    state.jobs.push({
      id: "job_1",
      character_id: "char_1",
      kind: "practice",
      presence: "offline",
      status: "running",
      phase: "init",
      template_id: null,
      template_snapshot: "{}",
      config: "{}",
      day: "2026-08-07",
      hours_today: 0,
      started_at: T0,
      scheduled_end_at: "2026-08-07T08:00:00.000Z",
      last_tick_at: T0,
      last_heartbeat_at: T0,
      journal_seq: 0,
      stop_reason: null,
      report: null,
      updated_at: T0,
    });
    await expect(
      afk.start("acc_1", { kind: "practice", config: { skillId: "basic_sword" } }),
    ).rejects.toMatchObject({ code: "already_running" });
  });
});

describe("afkService.stop", () => {
  it("无挂机 → not_running", async () => {
    const { afk } = boot();
    await expect(afk.stop("acc_1")).rejects.toMatchObject({ code: "not_running" });
  });

  it("停止运行中作业：置 cancelled、写战报（含 wuxia 叙事）", async () => {
    const { afk, state } = boot();
    await afk.start("acc_1", {
      kind: "practice",
      config: { skillId: "basic_sword" },
      durationMinutes: 60,
    });
    const report = await afk.stop("acc_1");
    expect(report).toMatchObject({
      kind: "practice",
      status: "cancelled",
      gains: { exp: 0, potential: 0, silver: 0 },
    });
    expect(report.narrative).toBeTruthy();
    expect(state.jobs[0]?.status).toBe("cancelled");
    expect(state.jobs[0]?.report).toBeTruthy();
  });
});

describe("afkService.status / reports", () => {
  it("status：无角色抛错；无作业 null；作业中返回视图", async () => {
    const { afk, state } = boot();
    await expect(afk.status("acc_x")).rejects.toMatchObject({ code: "no_character" });
    expect(await afk.status("acc_1")).toBeNull();

    const nowIso = new Date().toISOString();
    state.jobs.push({
      id: "job_1",
      character_id: "char_1",
      kind: "quest",
      presence: "offline",
      status: "running",
      phase: "init",
      template_id: null,
      template_snapshot: "{}",
      config: JSON.stringify({ questId: "q_hunt", gains: { exp: 0, potential: 0, silver: 0 } }),
      day: "2026-08-07",
      hours_today: 0,
      started_at: nowIso,
      scheduled_end_at: new Date(Date.now() + 3_600_000).toISOString(),
      last_tick_at: nowIso,
      last_heartbeat_at: nowIso,
      journal_seq: 0,
      stop_reason: null,
      report: null,
      updated_at: nowIso,
    });
    const view = await afk.status("acc_1");
    expect(view).toMatchObject({ id: "job_1", kind: "quest", status: "running" });
  });

  it("reports：返回终态作业战报，含叙事回退", async () => {
    const { afk, state } = boot();
    state.jobs.push(
      {
        id: "job_1",
        character_id: "char_1",
        kind: "quest",
        presence: "offline",
        status: "completed",
        phase: "done",
        template_id: null,
        template_snapshot: "{}",
        config: "{}",
        day: "2026-08-07",
        hours_today: 0,
        started_at: T0,
        scheduled_end_at: "2026-08-07T01:00:00.000Z",
        last_tick_at: T0,
        last_heartbeat_at: T0,
        journal_seq: 0,
        stop_reason: null,
        report: JSON.stringify({
          jobId: "job_1",
          kind: "quest",
          status: "completed",
          ticks: 1,
          durationMs: 3_600_000,
          gains: { exp: 10, potential: 2, silver: 1 },
        }),
        updated_at: T0,
      },
      {
        id: "job_2",
        character_id: "char_1",
        kind: "practice",
        presence: "offline",
        status: "cancelled",
        phase: "init",
        template_id: null,
        template_snapshot: "{}",
        config: "{}",
        day: "2026-08-07",
        hours_today: 0,
        started_at: T0,
        scheduled_end_at: "2026-08-07T01:00:00.000Z",
        last_tick_at: T0,
        last_heartbeat_at: T0,
        journal_seq: 0,
        stop_reason: "手动停止",
        report: JSON.stringify({
          jobId: "job_2",
          kind: "practice",
          status: "cancelled",
          ticks: 0,
          durationMs: 60_000,
          gains: { exp: 0, potential: 0, silver: 0 },
          reason: "手动停止",
        }),
        updated_at: T0,
      },
    );
    const list = await afk.reports("acc_1");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ jobId: "job_1", status: "completed", gains: { exp: 10 } });
    expect(list[0]?.narrative).toBe("尘埃落定，所托之事已有交代。");
    // 无叙事字段 → 按 kind/status 回退生成
    expect(list[1]?.narrative).toBe("你收住架势，江湖路长，改日再练。");
  });

  it("reports：收益小数向下取整为整数", async () => {
    const { afk, state } = boot();
    state.jobs.push({
      id: "job_frac",
      character_id: "char_1",
      kind: "grind",
      presence: "offline",
      status: "completed",
      phase: "done",
      template_id: null,
      template_snapshot: "{}",
      config: "{}",
      day: "2026-08-07",
      hours_today: 0,
      started_at: T0,
      scheduled_end_at: "2026-08-07T01:00:00.000Z",
      last_tick_at: T0,
      last_heartbeat_at: T0,
      journal_seq: 0,
      stop_reason: null,
      report: JSON.stringify({
        jobId: "job_frac",
        kind: "grind",
        status: "completed",
        ticks: 1,
        durationMs: 3_600_000,
        gains: { exp: 36.999999, potential: 18.5, silver: 8.123 },
      }),
      updated_at: T0,
    });
    const list = await afk.reports("acc_1");
    expect(list[0]?.gains).toEqual({ exp: 36, potential: 18, silver: 8 });
  });
});

describe("afkService.resume（心跳恢复）", () => {
  it("paused → running，并刷新心跳", async () => {
    const { afk, state } = boot();
    state.jobs.push({
      id: "job_1",
      character_id: "char_1",
      kind: "grind",
      presence: "online",
      status: "paused",
      phase: "work",
      template_id: null,
      template_snapshot: "{}",
      config: JSON.stringify({
        jobId: "village_chore",
        gains: { exp: 1, potential: 0, silver: 0 },
      }),
      day: "2026-08-07",
      hours_today: 0,
      started_at: T0,
      scheduled_end_at: "2026-08-07T01:00:00.000Z",
      last_tick_at: T0,
      last_heartbeat_at: T0,
      journal_seq: 0,
      stop_reason: "气息中断，行止暂歇",
      report: null,
      updated_at: T0,
    });
    const view = await afk.resume("acc_1");
    expect(view).toMatchObject({ id: "job_1", status: "running", presence: "online" });
    expect(state.jobs[0]?.status).toBe("running");
    expect(state.jobs[0]?.stop_reason).toBeNull();
  });
});

describe("app 集成（afk 路由）", () => {
  it("POST /afk/start → GET /afk/status → POST /afk/stop → GET /afk/reports 全链路", async () => {
    const { db, state } = mockDb();
    const app = await createApp({ deps: { db, content: PACK }, inviteCodes: ["inv-1"] });
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };
    state.characters.push({ id: "char_1", account_id: "acc_1", status: "active" });

    const start = await app.inject({
      method: "POST",
      url: "/afk/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "practice", durationMinutes: 30, config: { skillId: "basic_sword" } },
    });
    expect(start.statusCode).toBe(200);
    expect((start.json() as { kind: string }).kind).toBe("practice");

    const status = await app.inject({
      method: "GET",
      url: "/afk/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.statusCode).toBe(200);
    expect((status.json() as { status: string }).status).toBe("running");

    const dup = await app.inject({
      method: "POST",
      url: "/afk/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "practice", config: { skillId: "basic_sword" } },
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe("already_running");

    const stop = await app.inject({
      method: "POST",
      url: "/afk/stop",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stop.statusCode).toBe(200);
    expect((stop.json() as { status: string }).status).toBe("cancelled");

    const reports = await app.inject({
      method: "GET",
      url: "/afk/reports",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reports.statusCode).toBe(200);
    expect((reports.json() as unknown[]).length).toBe(1);

    const stopIdle = await app.inject({
      method: "POST",
      url: "/afk/stop",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stopIdle.statusCode).toBe(409);
    expect((stopIdle.json() as { error: { code: string } }).error.code).toBe("not_running");
  });

  it("AfkError 类型存在（路由映射依赖）", () => {
    expect(AfkError).toBeDefined();
  });
});
