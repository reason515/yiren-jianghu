import type { Pool, PoolClient } from "pg";
import { buildReport, processTick, type AfkJobState, type SkillMap } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { attemptsForHours, settleStudy } from "./settlement.js";
import { settleQuestBattle } from "./questSettlement.js";
import { settleGrind } from "./grindSettlement.js";

/**
 * F2 Worker 结算：以 last_tick_at 推进 running 作业。
 * 每桩作业在独立事务内以 FOR UPDATE 锁住；修炼逐次参悟，行侠按 DC-026
 * 自动推进已绑定击杀任务，生计（DC-042）按时长发三件套；资源与战报同事务提交。
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
  template_snapshot: unknown;
  config: unknown;
  day: string;
  hours_today: number;
  started_at: string;
  scheduled_end_at: string | null;
  last_tick_at: string | null;
}

interface QuestProgress {
  phase: number;
  counts: Record<string, number>;
}

const JOB_COLS =
  "id, character_id, kind, status, phase, template_snapshot, config, day, hours_today, started_at, scheduled_end_at, last_tick_at";

function parse<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

function gains(value?: Partial<{ exp: number; potential: number; silver: number }>) {
  return { exp: value?.exp ?? 0, potential: value?.potential ?? 0, silver: value?.silver ?? 0 };
}

/** 战报叙事（可变数值由 UI 单列展示）。 */
function narrativeFor(kind: string, status: string): string {
  if (status === "failed") {
    if (kind === "quest") return "风尘未定，事未办妥，只得折返。";
    if (kind === "grind") return "力不从心，杂役只好暂且放下。";
    return "气机不继，此行无功而返。";
  }
  if (kind === "quest") return "尘埃落定，所托之事已有交代。";
  if (kind === "grind") return "日头偏西，杂役已毕，银钱与历练一并入囊。";
  return "收功睁眼，只觉筋骨松活，神完气足。";
}

function stateOf(job: JobRow, now: number, currentGains = gains()): AfkJobState {
  const lastTick = job.last_tick_at ? Date.parse(job.last_tick_at) : Date.parse(job.started_at);
  return {
    id: job.id,
    characterId: job.character_id,
    kind: job.kind as "study" | "quest" | "grind",
    status: "running",
    phase: job.phase,
    startedAt: Date.parse(job.started_at),
    lastTickAt: lastTick,
    scheduledEndAt: job.scheduled_end_at ? Date.parse(job.scheduled_end_at) : lastTick,
    day: job.day,
    hoursToday: Number(job.hours_today),
    tickCount: 0,
    gains: currentGains,
  };
}

async function finishQuestJob(
  client: PoolClient,
  job: JobRow,
  now: number,
  input: {
    status: "completed" | "failed";
    phase: string;
    reason: string;
    config: Record<string, unknown>;
    gains: ReturnType<typeof gains>;
  },
): Promise<"completed"> {
  const terminal: AfkJobState = {
    ...stateOf(job, now, input.gains),
    status: input.status,
    phase: input.phase,
    stopReason: input.reason,
  };
  const report = buildReport(terminal, now);
  await client.query(
    "UPDATE afk_jobs SET status = $1, phase = $2, config = $3, last_tick_at = $4, report = $5, stop_reason = $6, updated_at = now() WHERE id = $7",
    [
      terminal.status,
      terminal.phase,
      JSON.stringify(input.config),
      new Date(now).toISOString(),
      JSON.stringify({ ...report, narrative: narrativeFor(job.kind, terminal.status) }),
      input.reason,
      job.id,
    ],
  );
  return "completed";
}

async function settleQuest(
  client: PoolClient,
  job: JobRow,
  content: ContentPack,
  now: number,
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const questId = typeof config.questId === "string" ? config.questId : "";
  const quest = content.quests.find((entry) => entry.id === questId);
  if (!quest) {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "所接差事已不在江湖簿中",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  if (job.scheduled_end_at && now >= Date.parse(job.scheduled_end_at)) {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "时限已尽，此事尚未办妥",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }

  const progressRows = await client.query<{
    status: "accepted" | "completed" | "reported";
    progress: unknown;
  }>("SELECT status, progress FROM character_quests WHERE character_id = $1 AND quest_id = $2", [
    job.character_id,
    quest.id,
  ]);
  const record = progressRows.rows[0];
  const progress = record ? parse<QuestProgress>(record.progress) : null;
  const phase = progress ? quest.phases[progress.phase] : undefined;
  if (!record || record.status !== "accepted" || !progress || !phase || phase.type !== "kill") {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "这桩差事已变，无法继续行侠",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  const target = content.npcs.find((entry) => entry.id === phase.targetId);
  if (!target || target.kind !== "battle") {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "所寻目标踪迹难辨，未能成行",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }

  const characterRows = await client.query<{
    id: string;
    name: string;
    attrs: { str: number; int: number; con: number; dex: number };
    qi: number;
    jing: number;
    neili: number;
    exp: number;
  }>("SELECT id, name, attrs, qi, jing, neili, exp FROM characters WHERE id = $1", [
    job.character_id,
  ]);
  const character = characterRows.rows[0];
  if (!character) {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "行侠之人已不在此地",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  const skillRows = await client.query<{ skill_id: string; level: number }>(
    "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
    [job.character_id],
  );
  const skillLevels = new Map(skillRows.rows.map((row) => [row.skill_id, row.level]));
  const priorGains = gains(config.gains as ReturnType<typeof gains>);
  const killIndex = (progress.counts[phase.targetId] ?? 0) + 1;
  const battle = settleQuestBattle({
    content,
    jobId: job.id,
    killIndex,
    character: { ...character, attrs: character.attrs ?? { str: 10, int: 10, con: 10, dex: 10 } },
    skillLevels,
    templateSnapshot: job.template_snapshot,
    target,
  });

  if (!battle.won) {
    const reasons = {
      defeated: "强敌当前，伤势难支，只得折返",
      fled: "见势不妙，暂且退回",
      draw: "缠斗未决，未能办妥此事",
      invalid_template: "战术卷册残缺，无法继续行侠",
    } as const;
    await client.query("UPDATE characters SET qi = $1, jing = $2, neili = $3 WHERE id = $4", [
      battle.combatant.qi,
      battle.combatant.jing,
      battle.combatant.neili,
      job.character_id,
    ]);
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: reasons[battle.reason ?? "draw"],
      config,
      gains: priorGains,
    });
  }

  const nextCounts = { ...progress.counts, [phase.targetId]: killIndex };
  const phaseComplete = killIndex >= phase.count;
  const nextPhase = phaseComplete ? progress.phase + 1 : progress.phase;
  const questComplete = nextPhase >= quest.phases.length;
  const npcRewards = target.battleRewards;
  const totalGains = gains({
    exp: priorGains.exp + npcRewards.exp + (questComplete ? quest.rewards.exp : 0),
    potential:
      priorGains.potential + npcRewards.potential + (questComplete ? quest.rewards.potential : 0),
    silver: priorGains.silver + npcRewards.silver + (questComplete ? quest.rewards.silver : 0),
  });
  await client.query(
    "UPDATE characters SET qi = $1, jing = $2, neili = $3, exp = exp + $4, potential = potential + $5, silver = silver + $6 WHERE id = $7",
    [
      battle.combatant.qi,
      battle.combatant.jing,
      battle.combatant.neili,
      npcRewards.exp + (questComplete ? quest.rewards.exp : 0),
      npcRewards.potential + (questComplete ? quest.rewards.potential : 0),
      npcRewards.silver + (questComplete ? quest.rewards.silver : 0),
      job.character_id,
    ],
  );
  for (const drop of battle.drops) {
    await client.query(
      "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, $3)",
      [job.character_id, drop.itemId, drop.count],
    );
  }

  const nextProgress = { phase: nextPhase, counts: nextCounts };
  if (questComplete) {
    await client.query(
      "UPDATE character_quests SET status = 'reported', progress = $1, completed_at = now(), reported_at = now() WHERE character_id = $2 AND quest_id = $3",
      [JSON.stringify(nextProgress), job.character_id, quest.id],
    );
    return finishQuestJob(client, job, now, {
      status: "completed",
      phase: "report",
      reason: "差事办妥",
      config: { ...config, gains: totalGains },
      gains: totalGains,
    });
  }
  await client.query(
    "UPDATE character_quests SET progress = $1 WHERE character_id = $2 AND quest_id = $3",
    [JSON.stringify(nextProgress), job.character_id, quest.id],
  );
  await client.query(
    "UPDATE afk_jobs SET phase = 'fight', config = $1, last_tick_at = $2, updated_at = now() WHERE id = $3",
    [JSON.stringify({ ...config, gains: totalGains }), new Date(now).toISOString(), job.id],
  );
  return "settled";
}

async function settleStudyJob(
  client: PoolClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
): Promise<"settled" | "completed"> {
  const config = parse<{ skillId?: string }>(job.config);
  const skillId = config.skillId ?? "";
  const skillDef = content.skills.find((skill) => skill.id === skillId);
  if (!skillDef) {
    const outcome = processTick({
      job: stateOf(job, now),
      params: content.params,
      now,
      deltaHours,
      hourlyGain: gains(),
      failure: "修炼目标缺失",
    });
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: outcome.job.phase,
      reason: outcome.job.stopReason ?? "修炼目标缺失",
      config: config as Record<string, unknown>,
      gains: gains(),
    });
  }
  const charRows = await client.query<{ jing: number }>(
    "SELECT jing FROM characters WHERE id = $1",
    [job.character_id],
  );
  const skillRows = await client.query<{
    skill_id: string;
    level: number;
    practice_points: number;
  }>("SELECT skill_id, level, practice_points FROM character_skills WHERE character_id = $1", [
    job.character_id,
  ]);
  const skillMap: SkillMap = {};
  for (const row of skillRows.rows)
    skillMap[row.skill_id] = { level: row.level, practicePoints: row.practice_points };
  const settled = settleStudy({
    params: content.params,
    jing: charRows.rows[0]?.jing ?? 0,
    skillId,
    skills: skillMap,
    maxLevel: skillDef.maxLevel,
    attempts: attemptsForHours(deltaHours, content.params.afk.studyAttemptsPerHour),
  });
  const outcome = processTick({
    job: stateOf(job, now),
    params: content.params,
    now,
    deltaHours,
    hourlyGain: gains(),
  });
  await client.query("UPDATE characters SET jing = jing - $1 WHERE id = $2", [
    settled.jingSpent,
    job.character_id,
  ]);
  const progress = settled.skills[skillId];
  if (progress) {
    await client.query(
      "INSERT INTO character_skills (character_id, skill_id, level, practice_points) VALUES ($1, $2, $3, $4) ON CONFLICT (character_id, skill_id) DO UPDATE SET level = EXCLUDED.level, practice_points = EXCLUDED.practice_points",
      [job.character_id, skillId, progress.level, progress.practicePoints],
    );
  }
  const done = outcome.status !== "running";
  const report = done ? buildReport(outcome.job, now) : null;
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
  return done ? "completed" : "settled";
}

async function settleGrindJob(
  client: PoolClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const jobId = typeof config.jobId === "string" ? config.jobId : "";
  const def = (content.grindJobs ?? []).find((entry) => entry.id === jobId);
  const priorGains = gains(config.gains as ReturnType<typeof gains>);
  if (!def) {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "此等杂役已不在簿中",
      config,
      gains: priorGains,
    });
  }

  const charRows = await client.query<{ jing: number; exp: number }>(
    "SELECT jing, exp FROM characters WHERE id = $1",
    [job.character_id],
  );
  const character = charRows.rows[0];
  if (!character) {
    return finishQuestJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "行止之人已不在此地",
      config,
      gains: priorGains,
    });
  }

  const settled = settleGrind({
    params: content.params,
    job: stateOf(job, now, priorGains),
    now,
    deltaHours,
    jing: character.jing,
    hourlyGain: def.hourlyGain,
    jingPerHour: def.jingPerHour,
    maxExp: def.maxExp,
    characterExp: character.exp,
  });

  const tickGains = settled.outcome.gained;
  const totalGains = gains({
    exp: priorGains.exp + tickGains.exp,
    potential: priorGains.potential + tickGains.potential,
    silver: priorGains.silver + tickGains.silver,
  });
  const nextConfig = { ...config, gains: totalGains };

  await client.query(
    "UPDATE characters SET jing = jing - $1, exp = exp + $2, potential = potential + $3, silver = silver + $4 WHERE id = $5",
    [settled.jingSpent, tickGains.exp, tickGains.potential, tickGains.silver, job.character_id],
  );

  if (settled.outcome.status !== "running") {
    return finishQuestJob(client, job, now, {
      status: settled.outcome.status === "completed" ? "completed" : "failed",
      phase: settled.outcome.status === "completed" ? "done" : "failed",
      reason: settled.outcome.job.stopReason ?? "杂役了结",
      config: nextConfig,
      gains: totalGains,
    });
  }

  await client.query(
    "UPDATE afk_jobs SET phase = 'work', day = $1, hours_today = $2, config = $3, last_tick_at = $4, updated_at = now() WHERE id = $5",
    [
      settled.outcome.job.day,
      settled.outcome.job.hoursToday,
      JSON.stringify(nextConfig),
      new Date(now).toISOString(),
      job.id,
    ],
  );
  return "settled";
}

async function settleOne(
  client: PoolClient,
  job: JobRow,
  content: ContentPack,
  now: number,
): Promise<"settled" | "completed" | "skipped"> {
  const lastTick = job.last_tick_at ? Date.parse(job.last_tick_at) : Date.parse(job.started_at);
  const deltaHours = (now - lastTick) / 3_600_000;
  if (deltaHours <= 0) return "skipped";
  if (job.kind === "quest") return settleQuest(client, job, content, now);
  if (job.kind === "grind") return settleGrindJob(client, job, content, now, deltaHours);
  return settleStudyJob(client, job, content, now, deltaHours);
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
    if (job.kind !== "study" && job.kind !== "quest" && job.kind !== "grind") {
      summary.skipped += 1;
      continue;
    }
    const client = await opts.pool.connect();
    try {
      await client.query("BEGIN");
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
      if (result === "completed") summary.completed += 1;
      else if (result === "settled") summary.settled += 1;
      else summary.skipped += 1;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return summary;
}
