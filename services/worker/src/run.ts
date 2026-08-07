import type { Pool, PoolClient } from "pg";
import { buildReport, processTick, type AfkJobState, type SkillMap } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { attemptsForHours, settleStudy } from "./settlement.js";

/**
 * F2 Worker 结算：跑一遍所有 running 的挂机作业。
 * - 以 last_tick_at 为基准结算 deltaHours（离线期间照常推进，天然覆盖"崩溃恢复"）；
 * - 每作业一个事务 + `FOR UPDATE` 行锁抢占，防多 Worker 实例重复结算（并发幂等）；
 * - 修炼型（study）逐次参悟结算；任务型（quest）待 PVE 战斗域落地（跳过并计数）。
 */

export interface SettlementSummary {
  scanned: number;
  settled: number;
  completed: number;
  skipped: number;
}

interface JobRow {
  id: string;
  character_id: string;
  kind: string;
  status: string;
  phase: string;
  config: unknown;
  day: string;
  hours_today: number;
  started_at: string;
  scheduled_end_at: string | null;
  last_tick_at: string | null;
}

const JOB_COLS =
  "id, character_id, kind, status, phase, config, day, hours_today, started_at, scheduled_end_at, last_tick_at";

function parse<T>(v: unknown): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
}

/** 战报叙事（wuxia 短句；与 api afkService 同风格，服务侧文案约定见 yjh-wuxia-copywriting）。 */
function narrativeFor(kind: string, status: string): string {
  if (status === "failed")
    return kind === "quest" ? "这一程走得勉强，事未了结，只得折返。" : "气机不继，此行无功而返。";
  return kind === "quest" ? "事已了结，一路风尘，尽数落袋。" : "收功睁眼，只觉筋骨松活，神完气足。";
}

async function settleOne(
  client: PoolClient,
  job: JobRow,
  content: ContentPack,
  now: number,
): Promise<"settled" | "skipped"> {
  const lastTick = job.last_tick_at ? Date.parse(job.last_tick_at) : Date.parse(job.started_at);
  const deltaHours = (now - lastTick) / 3_600_000;
  if (deltaHours <= 0) return "skipped";

  const config = parse<{ skillId?: string }>(job.config);
  const skillId = config.skillId ?? "";
  const skillDef = content.skills.find((s) => s.id === skillId);
  if (!skillDef) {
    // 配置缺失 → 判定失败（写终态战报）
    const jobState: AfkJobState = {
      id: job.id,
      characterId: job.character_id,
      kind: job.kind as "study",
      status: "running",
      phase: job.phase,
      startedAt: Date.parse(job.started_at),
      lastTickAt: lastTick,
      scheduledEndAt: job.scheduled_end_at ? Date.parse(job.scheduled_end_at) : lastTick,
      day: job.day,
      hoursToday: Number(job.hours_today),
      tickCount: 0,
      gains: { exp: 0, potential: 0, silver: 0 },
    };
    const outcome = processTick({
      job: jobState,
      params: content.params,
      now,
      deltaHours,
      hourlyGain: { exp: 0, potential: 0, silver: 0 },
      failure: "修炼目标缺失",
    });
    const report = buildReport(outcome.job, now);
    await client.query(
      "UPDATE afk_jobs SET status = $1, phase = $2, day = $3, hours_today = $4, last_tick_at = $5, report = $6, stop_reason = $7, updated_at = now() WHERE id = $8",
      [
        outcome.job.status,
        outcome.job.phase,
        outcome.job.day,
        outcome.job.hoursToday,
        new Date(now).toISOString(),
        JSON.stringify({ ...report, narrative: narrativeFor(job.kind, outcome.job.status) }),
        outcome.job.stopReason ?? null,
        job.id,
      ],
    );
    return "settled";
  }

  const charRows = await client.query<{ jing: number }>(
    "SELECT jing FROM characters WHERE id = $1",
    [job.character_id],
  );
  const jing = charRows.rows[0]?.jing ?? 0;

  const skillRows = await client.query<{
    skill_id: string;
    level: number;
    practice_points: number;
  }>("SELECT skill_id, level, practice_points FROM character_skills WHERE character_id = $1", [
    job.character_id,
  ]);
  const skillMap: SkillMap = {};
  for (const r of skillRows.rows) {
    skillMap[r.skill_id] = { level: r.level, practicePoints: r.practice_points };
  }

  const attempts = attemptsForHours(deltaHours, content.params.afk.studyAttemptsPerHour);
  const settled = settleStudy({
    params: content.params,
    jing,
    skillId,
    skills: skillMap,
    maxLevel: skillDef.maxLevel,
    attempts,
  });

  const jobState: AfkJobState = {
    id: job.id,
    characterId: job.character_id,
    kind: job.kind as "study",
    status: "running",
    phase: job.phase,
    startedAt: Date.parse(job.started_at),
    lastTickAt: lastTick,
    scheduledEndAt: job.scheduled_end_at ? Date.parse(job.scheduled_end_at) : lastTick,
    day: job.day,
    hoursToday: Number(job.hours_today),
    tickCount: 0,
    gains: { exp: 0, potential: 0, silver: 0 },
  };
  const outcome = processTick({
    job: jobState,
    params: content.params,
    now,
    deltaHours,
    hourlyGain: { exp: 0, potential: 0, silver: 0 },
  });

  await client.query("UPDATE characters SET jing = jing - $1 WHERE id = $2", [
    settled.jingSpent,
    job.character_id,
  ]);
  const prog = settled.skills[skillId];
  if (prog) {
    await client.query(
      "INSERT INTO character_skills (character_id, skill_id, level, practice_points) VALUES ($1, $2, $3, $4) ON CONFLICT (character_id, skill_id) DO UPDATE SET level = EXCLUDED.level, practice_points = EXCLUDED.practice_points",
      [job.character_id, skillId, prog.level, prog.practicePoints],
    );
  }

  const report = outcome.status !== "running" ? buildReport(outcome.job, now) : null;
  await client.query(
    "UPDATE afk_jobs SET status = $1, phase = $2, day = $3, hours_today = $4, last_tick_at = $5, report = $6, stop_reason = $7, updated_at = now() WHERE id = $8",
    [
      outcome.job.status,
      outcome.job.phase,
      outcome.job.day,
      outcome.job.hoursToday,
      new Date(now).toISOString(),
      report
        ? JSON.stringify({ ...report, narrative: narrativeFor(job.kind, outcome.job.status) })
        : null,
      outcome.job.stopReason ?? null,
      job.id,
    ],
  );
  return "settled";
}

export async function settleDueJobs(opts: {
  pool: Pool;
  content: ContentPack;
  now?: number;
}): Promise<SettlementSummary> {
  const now = opts.now ?? Date.now();
  const summary: SettlementSummary = { scanned: 0, settled: 0, completed: 0, skipped: 0 };

  const jobs = await opts.pool.query<JobRow>(
    `SELECT ${JOB_COLS} FROM afk_jobs WHERE status = 'running' ORDER BY scheduled_end_at ASC`,
  );

  for (const job of jobs.rows) {
    summary.scanned += 1;
    if (job.kind !== "study") {
      summary.skipped += 1; // quest 挂机待 PVE 战斗域（F1 待办）
      continue;
    }
    const client = await opts.pool.connect();
    try {
      await client.query("BEGIN");
      // 行锁抢占：同一作业仅一个 Worker 实例结算（并发幂等）
      const locked = await client.query<JobRow>(
        `SELECT ${JOB_COLS} FROM afk_jobs WHERE id = $1 AND status = 'running' FOR UPDATE`,
        [job.id],
      );
      const current = locked.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        continue;
      }
      const result = await settleOne(client, current, opts.content, now);
      await client.query("COMMIT");
      summary.settled += result === "settled" ? 1 : 0;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  return summary;
}
