import { randomUUID } from "node:crypto";
import {
  buildReport,
  cancelJob,
  createJob,
  type AfkJobKind,
  type AfkJobState,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db } from "./db.js";

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
  status: string;
  phase: string;
  startedAt: string;
  scheduledEndAt: string;
  stopReason?: string;
  gains: AfkGainsView;
  config: Record<string, unknown>;
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
  /** 挂机法门（服务端校验 study/quest/grind；路由层只透传）。 */
  kind: string;
  /** 战术模板 id（quest 模式必填；study/grind 无需）。 */
  templateId?: string;
  /** 分钟；缺省取参数表上限。 */
  durationMinutes?: number;
  /** 挂机配置：study → { skillId }；quest → { questId }；grind → { jobId }。 */
  config?: Record<string, unknown>;
}

export interface AfkService {
  start(accountId: string, input: AfkStartInput): Promise<AfkJobView>;
  stop(accountId: string): Promise<AfkReportView>;
  status(accountId: string): Promise<AfkJobView | null>;
  reports(accountId: string, limit?: number): Promise<AfkReportView[]>;
  /** 当前角色可接的生计杂役（按 maxExp 过滤）。 */
  grindJobs(accountId: string): Promise<AfkGrindJobView[]>;
}

export interface AfkGrindJobView {
  id: string;
  name: string;
  description: string;
  maxExp: number;
  hourlyGain: AfkGainsView;
  jingPerHour: number;
}

type AfkJobRow = {
  id: string;
  character_id: string;
  kind: AfkJobKind;
  status: string;
  phase: string;
  template_snapshot: Record<string, unknown>;
  config: Record<string, unknown>;
  day: string;
  hours_today: number;
  started_at: string;
  scheduled_end_at: string | null;
  last_tick_at: string | null;
  stop_reason: string | null;
  report: string | null;
};

const GAIN_KEYS = ["exp", "potential", "silver"] as const;

function gainsView(g: Partial<Record<(typeof GAIN_KEYS)[number], number>>): AfkGainsView {
  const out: AfkGainsView = { exp: 0, potential: 0, silver: 0 };
  for (const k of GAIN_KEYS) out[k] = g[k] ?? 0;
  return out;
}

/** 战报叙事（wuxia 短句；可变数值只进 UI 不进文案）。 */
function narrativeFor(kind: AfkJobKind, status: string): string {
  if (status === "cancelled") return "你收住架势，江湖路长，改日再练。";
  if (status === "failed") {
    if (kind === "quest") return "这一程走得勉强，事未了结，只得折返。";
    if (kind === "grind") return "力不从心，杂役只好暂且放下。";
    return "气机不继，此行无功而返。";
  }
  if (kind === "quest") return "事已了结，一路风尘，尽数落袋。";
  if (kind === "grind") return "日头偏西，杂役已毕，银钱与历练一并入囊。";
  return "收功睁眼，只觉筋骨松活，神完气足。";
}

export function createAfkService(db: Db, content: ContentPack): AfkService {
  const skillsById = new Map(content.skills.map((s) => [s.id, s]));
  const questsById = new Map(content.quests.map((quest) => [quest.id, quest]));
  const grindById = new Map((content.grindJobs ?? []).map((job) => [job.id, job]));
  const maxHours = content.params.afk.maxDurationHours;
  const maxMinutes = Math.floor(maxHours * 60);

  const activeCharacter = async (
    accountId: string,
  ): Promise<{ id: string; exp: number } | null> => {
    const rows = await db.query<{ id: string; exp: number }>(
      "SELECT id, exp FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const activeJobRow = async (characterId: string): Promise<AfkJobRow | null> => {
    const rows = await db.query<AfkJobRow>(
      "SELECT id, character_id, kind, status, phase, template_snapshot, config, day, hours_today, started_at, scheduled_end_at, last_tick_at, stop_reason, report FROM afk_jobs WHERE character_id = $1 AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1",
      [characterId],
    );
    return rows.rows[0] ?? null;
  };

  const rowToJob = (row: AfkJobRow): AfkJobState => ({
    id: row.id,
    characterId: row.character_id ?? "",
    kind: row.kind,
    status: row.status as AfkJobState["status"],
    phase: row.phase,
    startedAt: Date.parse(row.started_at),
    lastTickAt: row.last_tick_at ? Date.parse(row.last_tick_at) : Date.parse(row.started_at),
    scheduledEndAt: row.scheduled_end_at
      ? Date.parse(row.scheduled_end_at)
      : Date.parse(row.started_at),
    day: row.day,
    hoursToday: Number(row.hours_today),
    tickCount: 0,
    stopReason: row.stop_reason ?? undefined,
    gains: gainsView({}),
  });

  const jobView = (row: AfkJobRow): AfkJobView => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    phase: row.phase,
    startedAt: row.started_at,
    scheduledEndAt: row.scheduled_end_at ?? row.started_at,
    stopReason: row.stop_reason ?? undefined,
    gains: gainsView({}),
    config: row.config,
  });

  return {
    async start(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      if (input.kind !== "study" && input.kind !== "quest" && input.kind !== "grind") {
        throw new AfkError("invalid_kind", "不识得的挂机法门");
      }
      const minutes = input.durationMinutes ?? maxMinutes;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > maxMinutes) {
        throw new AfkError("invalid_duration", `挂机时长须在 1–${maxMinutes} 分钟之间`);
      }

      const config = input.config ?? {};
      if (input.kind === "study") {
        const skillId = typeof config.skillId === "string" ? config.skillId : "";
        if (!skillId || !skillsById.has(skillId)) {
          throw new AfkError("invalid_config", "修炼挂机须指定一门已知武功");
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

      // 战术模板：quest 模式必填，快照固化
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
        kind: input.kind,
        now,
        params: content.params,
      });
      job.scheduledEndAt = now + minutes * 60_000;

      await db.query(
        "INSERT INTO afk_jobs (id, character_id, kind, status, phase, template_id, template_snapshot, config, day, hours_today, started_at, scheduled_end_at, last_tick_at) VALUES ($1, $2, $3, 'running', 'init', $4, $5, $6, $7, 0, $8, $9, $8)",
        [
          job.id,
          ch.id,
          job.kind,
          templateId,
          JSON.stringify(templateSnapshot),
          JSON.stringify(config),
          job.day,
          new Date(job.startedAt).toISOString(),
          new Date(job.scheduledEndAt).toISOString(),
        ],
      );
      return {
        id: job.id,
        kind: job.kind,
        status: job.status,
        phase: job.phase,
        startedAt: new Date(job.startedAt).toISOString(),
        scheduledEndAt: new Date(job.scheduledEndAt).toISOString(),
        gains: gainsView({}),
        config,
      };
    },

    async stop(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const row = await activeJobRow(ch.id);
      if (!row) throw new AfkError("not_running", "眼下并无挂机中的行程");

      const now = Date.now();
      const job = cancelJob(rowToJob(row), now, "手动停止");
      const report = buildReport(job, now);
      const narrative = narrativeFor(job.kind, job.status);
      await db.query(
        "UPDATE afk_jobs SET status = $1, stop_reason = $2, report = $3, updated_at = now() WHERE id = $4",
        [job.status, job.stopReason ?? null, JSON.stringify({ ...report, narrative }), job.id],
      );
      return {
        jobId: report.jobId,
        kind: report.kind,
        status: report.status,
        reason: report.reason,
        durationMinutes: Math.max(1, Math.round(report.durationMs / 60_000)),
        gains: gainsView(report.gains),
        narrative,
      };
    },

    async status(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const row = await activeJobRow(ch.id);
      if (!row) return null;
      return jobView(row);
    },

    async reports(accountId, limit = 10) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new AfkError("no_character", "尚未立名闯江湖");
      const n = Math.min(Math.max(1, limit), 20);
      const rows = await db.query<AfkJobRow>(
        "SELECT id, character_id, kind, status, phase, template_snapshot, config, day, hours_today, started_at, scheduled_end_at, last_tick_at, stop_reason, report FROM afk_jobs WHERE character_id = $1 AND status IN ('completed','failed','cancelled') ORDER BY updated_at DESC LIMIT $2",
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
          kind: row.kind,
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
        }));
    },
  };
}
