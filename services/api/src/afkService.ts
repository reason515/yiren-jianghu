import { randomUUID } from "node:crypto";
import { createJob, type AfkJobKind } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import {
  JOB_COLS,
  gains as zeroGains,
  narrativeFor,
  progressOf,
  settleJobNow,
  stopJobNow,
  type AfkPresence,
  type JobRow,
} from "@yjh/worker";
import type { Db } from "./db.js";

async function withTx<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  if (db.transaction) return db.transaction(work);
  return work(db);
}

/** 挂机域错误（code 进入错误信封）。 */
export class AfkError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AfkError";
  }
}

export interface AfkGainsView {
  exp: number;
  potential: number;
  silver: number;
}

export interface AfkJobView {
  id: string;
  kind: AfkJobKind;
  presence: AfkPresence;
  status: string;
  phase: string;
  startedAt: string;
  scheduledEndAt: string;
  stopReason?: string;
  gains: AfkGainsView;
  progress: number;
  elapsedMs: number;
  totalMs: number;
  journalLines: string[];
  config: Record<string, unknown>;
  /** DC-045：当前房间（在线生计）。 */
  roomId?: string;
  /** DC-045：goto_hub | circuit。 */
  grindPhase?: string;
  /** DC-045：已合圈轮数。 */
  rounds?: number;
}

export interface AfkReportView {
  jobId: string;
  kind: AfkJobKind;
  status: "completed" | "failed" | "cancelled";
  reason?: string;
  durationMinutes: number;
  gains: AfkGainsView;
  narrative: string;
}

export interface AfkStartInput {
  kind: string;
  /** online | offline；缺省 offline。在线仅 grind/quest。 */
  presence?: string;
  templateId?: string;
  durationMinutes?: number;
  config?: Record<string, unknown>;
}

export interface AfkGrindJobView {
  id: string;
  name: string;
  description: string;
  maxExp: number;
  hourlyGain: AfkGainsView;
  jingPerHour: number;
  roundGain?: AfkGainsView;
  jingPerRound?: number;
  hubRoomId?: string;
}

export interface AfkService {
  start(accountId: string, input: AfkStartInput): Promise<AfkJobView>;
  stop(accountId: string): Promise<AfkReportView>;
  status(accountId: string): Promise<AfkJobView | null>;
  resume(accountId: string): Promise<AfkJobView>;
  reports(accountId: string, limit?: number): Promise<AfkReportView[]>;
  grindJobs(accountId: string): Promise<AfkGrindJobView[]>;
}

type AfkJobDbRow = JobRow & {
  report: string | null;
};

const GAIN_KEYS = ["exp", "potential", "silver"] as const;

function gainsView(g: Partial<Record<(typeof GAIN_KEYS)[number], number>>): AfkGainsView {
  const out: AfkGainsView = { exp: 0, potential: 0, silver: 0 };
  for (const k of GAIN_KEYS) out[k] = Math.floor(g[k] ?? 0);
  return out;
}

function parseConfig(value: unknown): Record<string, unknown> {
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
}

export function createAfkService(db: Db, content: ContentPack): AfkService {
  const skillsById = new Map(content.skills.map((s) => [s.id, s]));
  const questsById = new Map(content.quests.map((quest) => [quest.id, quest]));
  const grindById = new Map((content.grindJobs ?? []).map((job) => [job.id, job]));
  const maxHours = content.params.afk.maxDurationHours;
  const maxMinutes = Math.floor(maxHours * 60);

  const activeCharacter = async (
    accountId: string,
  ): Promise<{ id: string; exp: number; room_path: string } | null> => {
    const rows = await db.query<{ id: string; exp: number; room_path: string }>(
      "SELECT id, exp, room_path FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const activeJobRow = async (characterId: string): Promise<AfkJobDbRow | null> => {
    const rows = await db.query<AfkJobDbRow>(
      `SELECT ${JOB_COLS}, report FROM afk_jobs WHERE character_id = $1 AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1`,
      [characterId],
    );
    return rows.rows[0] ?? null;
  };

  const toView = (
    row: AfkJobDbRow,
    extra?: { journalLines?: string[]; now?: number; roomId?: string },
  ): AfkJobView => {
    const config = parseConfig(row.config);
    const prog = progressOf({
      started_at: row.started_at,
      scheduled_end_at: row.scheduled_end_at,
      now: extra?.now,
    });
    const grindPhase =
      typeof config.phase === "string" &&
      (config.phase === "goto_hub" || config.phase === "circuit")
        ? config.phase
        : undefined;
    const rounds = typeof config.rounds === "number" ? config.rounds : undefined;
    return {
      id: row.id,
      kind: row.kind as AfkJobKind,
      presence: row.presence,
      status: row.status,
      phase: row.phase,
      startedAt: row.started_at,
      scheduledEndAt: row.scheduled_end_at ?? row.started_at,
      stopReason: row.stop_reason ?? undefined,
      gains: gainsView(zeroGains(config.gains as ReturnType<typeof zeroGains>)),
      progress: prog.progress,
      elapsedMs: prog.elapsedMs,
      totalMs: prog.totalMs,
      journalLines: extra?.journalLines ?? [],
      config,
      ...(extra?.roomId ? { roomId: extra.roomId } : {}),
      ...(grindPhase ? { grindPhase } : {}),
      ...(rounds !== undefined ? { rounds } : {}),
    };
  };

  return {
    async start(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");

      const presence: AfkPresence = input.presence === "online" ? "online" : "offline";
      if (
        input.kind !== "study" &&
        input.kind !== "practice" &&
        input.kind !== "dazuo" &&
        input.kind !== "tuna" &&
        input.kind !== "quest" &&
        input.kind !== "grind"
      ) {
        throw new AfkError("invalid_kind", "不识得的挂机法门");
      }
      if (
        presence === "online" &&
        (input.kind === "study" ||
          input.kind === "practice" ||
          input.kind === "dazuo" ||
          input.kind === "tuna")
      ) {
        throw new AfkError("invalid_kind", "修炼暂只支持离线挂机");
      }
      if (input.kind === "study") {
        throw new AfkError("invalid_kind", "参悟已并入练功，请改选练功法门");
      }

      const minutes = input.durationMinutes ?? (presence === "online" ? 30 : maxMinutes);
      const maxOnline = 60;
      const maxAllowed = presence === "online" ? maxOnline : maxMinutes;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > maxAllowed) {
        throw new AfkError("invalid_duration", `挂机时长须在 1–${maxAllowed} 分钟之间`);
      }

      const config = input.config ?? {};
      if (input.kind === "practice") {
        const skillId = typeof config.skillId === "string" ? config.skillId : "";
        if (!skillId || !skillsById.has(skillId)) {
          throw new AfkError("invalid_config", "练功挂机须指定一门已知武功");
        }
      }

      if (input.kind === "grind") {
        const jobId = typeof config.jobId === "string" ? config.jobId : "";
        const grind = grindById.get(jobId);
        if (!grind) throw new AfkError("invalid_config", "生计挂机须择一桩杂役");
        if (grind.maxExp > 0 && ch.exp >= grind.maxExp) {
          throw new AfkError("grind_unavailable", "历练已够，此等杂役再做无益");
        }
      }

      let templateId: string | null = null;
      let templateSnapshot: Record<string, unknown> = {};
      if (input.templateId) {
        const t = await db.query<{ id: string; config: string | Record<string, unknown> }>(
          "SELECT id, config FROM tactic_templates WHERE id = $1 AND character_id = $2",
          [input.templateId, ch.id],
        );
        const row = t.rows[0];
        if (!row) throw new AfkError("not_found", "这份战术不在你的剑谱里");
        templateId = row.id;
        templateSnapshot =
          typeof row.config === "string"
            ? (JSON.parse(row.config) as Record<string, unknown>)
            : row.config;
      } else if (input.kind === "quest") {
        throw new AfkError("template_required", "行侠挂机须先备下一套战术");
      }

      if (input.kind === "quest") {
        const questId = typeof config.questId === "string" ? config.questId : "";
        const quest = questsById.get(questId);
        if (!quest) throw new AfkError("invalid_config", "行侠挂机须择一桩已接差事");
        const records = await db.query<{
          status: "accepted" | "completed" | "reported";
          progress: { phase: number; counts: Record<string, number> };
        }>(
          "SELECT status, progress FROM character_quests WHERE character_id = $1 AND quest_id = $2",
          [ch.id, questId],
        );
        const record = records.rows[0];
        const phase = record ? quest.phases[record.progress.phase] : undefined;
        if (!record || record.status !== "accepted" || !phase || phase.type !== "kill") {
          throw new AfkError("quest_unavailable", "这桩差事眼下不宜行侠");
        }
        const target = content.npcs.find((npc) => npc.id === phase.targetId);
        if (!target || target.kind !== "battle") {
          throw new AfkError("quest_unavailable", "所寻目标不宜以行侠之法应对");
        }
      }

      const existing = await activeJobRow(ch.id);
      if (existing) throw new AfkError("already_running", "一桩挂机未了结，不可另开");

      const now = Date.now();
      const job = createJob({
        id: randomUUID(),
        characterId: ch.id,
        kind: input.kind as AfkJobKind,
        now,
        params: content.params,
      });
      job.scheduledEndAt = now + minutes * 60_000;
      const startedIso = new Date(job.startedAt).toISOString();
      const endIso = new Date(job.scheduledEndAt).toISOString();

      let startConfig: Record<string, unknown> = {
        ...config,
        gains: zeroGains(),
        journal: [],
        carry: {},
      };
      if (input.kind === "grind" && presence === "online") {
        const jobId = typeof config.jobId === "string" ? config.jobId : "";
        const grind = grindById.get(jobId);
        if (grind?.hubRoomId && grind.route.length >= 2) {
          const atHub = ch.room_path === grind.hubRoomId;
          startConfig = {
            ...startConfig,
            phase: atHub ? "circuit" : "goto_hub",
            routeIndex: 0,
            pendingWork: 0,
            rounds: 0,
            lineSeq: 0,
          };
        }
      }

      const view = await withTx(db, async (tx) => {
        await tx.query(
          `INSERT INTO afk_jobs (
          id, character_id, kind, presence, status, phase, template_id, template_snapshot, config,
          day, hours_today, started_at, scheduled_end_at, last_tick_at, last_heartbeat_at, journal_seq
        ) VALUES ($1,$2,$3,$4,'running','init',$5,$6,$7,$8,0,$9,$10,$9,$9,0)`,
          [
            job.id,
            ch.id,
            job.kind,
            presence,
            templateId,
            JSON.stringify(templateSnapshot),
            JSON.stringify(startConfig),
            job.day,
            startedIso,
            endIso,
          ],
        );
        const locked = await tx.query<AfkJobDbRow>(
          `SELECT ${JOB_COLS}, report FROM afk_jobs WHERE id = $1 FOR UPDATE`,
          [job.id],
        );
        const current = locked.rows[0];
        if (!current) throw new AfkError("not_running", "挂机尚未开始");
        let journalLines: string[] = [];
        let after = current;
        if (presence === "online") {
          const settled = await settleJobNow(tx, current, content, now, "start");
          journalLines = settled.journalLines;
          const refreshed = await tx.query<AfkJobDbRow>(
            `SELECT ${JOB_COLS}, report FROM afk_jobs WHERE id = $1`,
            [job.id],
          );
          after = refreshed.rows[0] ?? after;
          if (journalLines.length > 0 && after.status === "running") {
            await tx.query("UPDATE afk_jobs SET journal_seq = journal_seq + $1 WHERE id = $2", [
              journalLines.length,
              after.id,
            ]);
          }
        }
        const loc = await tx.query<{ room_path: string }>(
          "SELECT room_path FROM characters WHERE id = $1",
          [ch.id],
        );
        return toView(after, {
          now,
          journalLines,
          roomId: loc.rows[0]?.room_path,
        });
      });

      return {
        id: job.id,
        kind: view.kind,
        presence: view.presence,
        status: view.status,
        phase: view.phase,
        startedAt: startedIso,
        scheduledEndAt: endIso,
        gains: view.gains,
        progress: view.progress,
        elapsedMs: view.elapsedMs,
        totalMs: view.totalMs,
        journalLines: view.journalLines,
        config: view.config,
        ...(view.roomId ? { roomId: view.roomId } : {}),
        ...(view.grindPhase ? { grindPhase: view.grindPhase, rounds: view.rounds ?? 0 } : {}),
      };
    },

    async stop(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const row = await activeJobRow(ch.id);
      if (!row) throw new AfkError("not_running", "眼下并无挂机中的行程");

      const now = Date.now();
      return withTx(db, async (tx) => {
        const locked = await tx.query<JobRow>(
          `SELECT ${JOB_COLS} FROM afk_jobs WHERE id = $1 AND status IN ('running','paused') FOR UPDATE`,
          [row.id],
        );
        const current = locked.rows[0];
        if (!current) throw new AfkError("not_running", "眼下并无挂机中的行程");
        if (current.presence === "online" && current.status === "running") {
          await tx.query("UPDATE afk_jobs SET last_heartbeat_at = $1 WHERE id = $2", [
            new Date(now).toISOString(),
            current.id,
          ]);
          current.last_heartbeat_at = new Date(now).toISOString();
        }
        const { report, gains } = await stopJobNow(tx, current, content, now);
        return {
          jobId: report.jobId,
          kind: report.kind,
          status: report.status,
          reason: report.reason,
          durationMinutes: Math.max(1, Math.round(report.durationMs / 60_000)),
          gains: gainsView(gains),
          narrative: report.narrative,
        };
      });
    },

    async status(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const row = await activeJobRow(ch.id);
      if (!row) return null;

      const now = Date.now();
      return withTx(db, async (tx) => {
        const locked = await tx.query<JobRow>(
          `SELECT ${JOB_COLS} FROM afk_jobs WHERE id = $1 AND status IN ('running','paused') FOR UPDATE`,
          [row.id],
        );
        let current = locked.rows[0];
        if (!current) return null;

        let journalLines: string[] = [];
        if (current.status === "running") {
          if (current.presence === "online") {
            await tx.query("UPDATE afk_jobs SET last_heartbeat_at = $1 WHERE id = $2", [
              new Date(now).toISOString(),
              current.id,
            ]);
            current = { ...current, last_heartbeat_at: new Date(now).toISOString() };
          }
          const settled = await settleJobNow(tx, current, content, now, "status");
          journalLines = settled.journalLines;
          const refreshed = await tx.query<AfkJobDbRow>(
            `SELECT ${JOB_COLS}, report FROM afk_jobs WHERE id = $1`,
            [current.id],
          );
          current = refreshed.rows[0] ?? settled.job;
          if (journalLines.length > 0 && current.status === "running") {
            await tx.query("UPDATE afk_jobs SET journal_seq = journal_seq + $1 WHERE id = $2", [
              journalLines.length,
              current.id,
            ]);
          }
        }
        const viewRow = { ...current, report: null } as AfkJobDbRow;
        const loc = await tx.query<{ room_path: string }>(
          "SELECT room_path FROM characters WHERE id = $1",
          [ch.id],
        );
        return toView(viewRow, {
          journalLines,
          now,
          roomId: loc.rows[0]?.room_path ?? ch.room_path,
        });
      });
    },

    async resume(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const row = await activeJobRow(ch.id);
      if (!row) throw new AfkError("not_running", "眼下并无挂机中的行程");
      if (row.status !== "paused") throw new AfkError("not_paused", "挂机并未中断");

      const now = Date.now();
      const iso = new Date(now).toISOString();
      await db.query(
        "UPDATE afk_jobs SET status = 'running', stop_reason = NULL, last_tick_at = $1, last_heartbeat_at = $1, updated_at = now() WHERE id = $2",
        [iso, row.id],
      );
      const refreshed = await activeJobRow(ch.id);
      if (!refreshed) throw new AfkError("not_running", "眼下并无挂机中的行程");
      return toView(refreshed, { now });
    },

    async reports(accountId, limit = 10) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const n = Math.min(Math.max(1, limit), 20);
      const rows = await db.query<AfkJobDbRow>(
        `SELECT ${JOB_COLS}, report FROM afk_jobs WHERE character_id = $1 AND status IN ('completed','failed','cancelled') ORDER BY updated_at DESC LIMIT $2`,
        [ch.id, n],
      );
      const out: AfkReportView[] = [];
      for (const row of rows.rows) {
        if (!row.report) continue;
        const r = (typeof row.report === "string" ? JSON.parse(row.report) : row.report) as {
          jobId?: string;
          status: "completed" | "failed" | "cancelled";
          reason?: string;
          durationMs: number;
          gains: Partial<Record<(typeof GAIN_KEYS)[number], number>>;
          narrative?: string;
        };
        out.push({
          jobId: r.jobId ?? row.id,
          kind: row.kind as AfkJobKind,
          status: r.status,
          reason: r.reason,
          durationMinutes: Math.max(1, Math.round((r.durationMs ?? 0) / 60_000)),
          gains: gainsView(r.gains),
          narrative: r.narrative ?? narrativeFor(row.kind, r.status),
        });
      }
      return out;
    },

    async grindJobs(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      return (content.grindJobs ?? [])
        .filter((job) => job.maxExp === 0 || ch.exp < job.maxExp)
        .map((job) => ({
          id: job.id,
          name: job.name,
          description: job.description,
          maxExp: job.maxExp,
          hourlyGain: gainsView(job.hourlyGain),
          jingPerHour: job.jingPerHour,
          ...(job.hubRoomId ? { hubRoomId: job.hubRoomId } : {}),
          ...(job.roundGain ? { roundGain: gainsView(job.roundGain) } : {}),
          ...(job.jingPerRound ? { jingPerRound: job.jingPerRound } : {}),
        }));
    },
  };
}
