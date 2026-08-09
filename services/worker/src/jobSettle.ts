import type { Pool } from "pg";
import {
  buildReport,
  cancelJob,
  processTick,
  type AfkJobState,
  type AfkReport,
  type SkillMap,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { attemptsForHours, settleStudy } from "./settlement.js";
import { settleQuestBattle } from "./questSettlement.js";
import { settleGrind } from "./grindSettlement.js";

/**
 * DC-043 挂机结算：离线按时长推进；在线短轮回 + 心跳 pause；status/stop/worker 分模式。
 */
export type AfkPresence = "online" | "offline";
export type SettleMode = "worker" | "status" | "stop";

export interface SqlClient {
  query<T extends { [key: string]: unknown }>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface JobRow {
  [key: string]: unknown;
  id: string;
  character_id: string;
  kind: string;
  status: string;
  phase: string;
  presence: AfkPresence;
  template_snapshot: unknown;
  config: unknown;
  day: string;
  hours_today: number;
  started_at: string;
  scheduled_end_at: string | null;
  last_tick_at: string | null;
  last_heartbeat_at: string | null;
  journal_seq: number;
  stop_reason: string | null;
}

export const JOB_COLS =
  "id, character_id, kind, status, phase, presence, template_snapshot, config, day, hours_today, started_at, scheduled_end_at, last_tick_at, last_heartbeat_at, journal_seq, stop_reason";

export interface SettlementSummary {
  scanned: number;
  settled: number;
  completed: number;
  skipped: number;
  paused: number;
}

export type SettleJobResult = {
  job: JobRow;
  journalLines: string[];
  result: "settled" | "completed" | "paused" | "skipped";
};

interface QuestProgress {
  phase: number;
  counts: Record<string, number>;
}

const MAX_ONLINE_TICKS_PER_CALL = 120;

export function gains(value?: Partial<{ exp: number; potential: number; silver: number }>) {
  return { exp: value?.exp ?? 0, potential: value?.potential ?? 0, silver: value?.silver ?? 0 };
}

function parse<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

function scaledGain(base: { exp: number; potential: number; silver: number }, mult: number) {
  return {
    exp: base.exp * mult,
    potential: base.potential * mult,
    silver: base.silver * mult,
  };
}

/** 角色资源列是 integer/bigint，短 tick 小数直接写入会触发 invalid input syntax。 */
export type ResourceCarry = {
  exp: number;
  potential: number;
  silver: number;
  jing: number;
};

export function emptyCarry(): ResourceCarry {
  return { exp: 0, potential: 0, silver: 0, jing: 0 };
}

export function parseCarry(value: unknown): ResourceCarry {
  const raw = (value ?? {}) as Partial<ResourceCarry>;
  return {
    exp: Number(raw.exp) || 0,
    potential: Number(raw.potential) || 0,
    silver: Number(raw.silver) || 0,
    jing: Number(raw.jing) || 0,
  };
}

/** 累计小数，本次只落库 floor 部分，余数进 carry（在线 60s tick 不丢收益）。 */
export function splitApplied(
  carry: ResourceCarry,
  delta: ResourceCarry,
): { applied: ResourceCarry; nextCarry: ResourceCarry } {
  const sum: ResourceCarry = {
    exp: carry.exp + delta.exp,
    potential: carry.potential + delta.potential,
    silver: carry.silver + delta.silver,
    jing: carry.jing + delta.jing,
  };
  const applied: ResourceCarry = {
    exp: Math.floor(sum.exp),
    potential: Math.floor(sum.potential),
    silver: Math.floor(sum.silver),
    jing: Math.floor(sum.jing),
  };
  return {
    applied,
    nextCarry: {
      exp: sum.exp - applied.exp,
      potential: sum.potential - applied.potential,
      silver: sum.silver - applied.silver,
      jing: sum.jing - applied.jing,
    },
  };
}

function toDbInt(n: number): number {
  return Math.max(0, Math.round(n));
}

/** 战报叙事（可变数值由 UI 单列展示）。 */
export function narrativeFor(kind: string, status: string): string {
  if (status === "cancelled") {
    if (kind === "quest") return "你收剑立定，差事未完，改日再续。";
    if (kind === "grind") return "你放下手头活计，碎银已入袋，余下的改日再忙。";
    return "你收住架势，江湖路长，改日再练。";
  }
  if (status === "paused") {
    if (kind === "quest") return "行止暂歇，剑意未散，待你归来再续。";
    if (kind === "grind") return "手头一停，气息稍乱，待你回神再续。";
    return "行止暂歇，待你回神再续。";
  }
  if (status === "failed") {
    if (kind === "quest") return "风尘未定，事未办妥，只得折返。";
    if (kind === "grind") return "力不从心，杂役只好暂且放下。";
    return "气劲不继，此行无功而返。";
  }
  if (kind === "quest") return "尘埃落定，所托之事已有交代。";
  if (kind === "grind") return "日头偏西，杂役已毕，银钱与历练一并入囊。";
  return "收功睁眼，只觉筋骨松活，神完气足。";
}

export function progressOf(input: {
  started_at: string;
  scheduled_end_at: string | null;
  now?: number;
}): { progress: number; elapsedMs: number; totalMs: number } {
  const now = input.now ?? Date.now();
  const started = Date.parse(input.started_at);
  const end = input.scheduled_end_at ? Date.parse(input.scheduled_end_at) : started;
  const totalMs = Math.max(1, end - started);
  const elapsedMs = Math.min(Math.max(0, now - started), totalMs);
  return { progress: elapsedMs / totalMs, elapsedMs, totalMs };
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

function grindOnlineLine(def: { onlineLines?: string[] }, seq: number): string {
  const lines =
    def.onlineLines && def.onlineLines.length > 0
      ? def.onlineLines
      : ["手头又忙过一阵，碎银与历练悄悄入账。"];
  return lines[seq % lines.length]!;
}

function appendJournal(config: Record<string, unknown>, lines: string[]): Record<string, unknown> {
  const prev = Array.isArray(config.journal) ? (config.journal as string[]) : [];
  return { ...config, journal: [...prev, ...lines] };
}

async function finishTerminalJob(
  client: SqlClient,
  job: JobRow,
  now: number,
  input: {
    status: "completed" | "failed" | "cancelled";
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

async function pauseForHeartbeat(
  client: SqlClient,
  job: JobRow,
  now: number,
): Promise<SettleJobResult> {
  const reason = "气息中断，行止暂歇";
  const iso = new Date(now).toISOString();
  await client.query(
    "UPDATE afk_jobs SET status = 'paused', stop_reason = $1, last_tick_at = $2, updated_at = now() WHERE id = $3",
    [reason, iso, job.id],
  );
  return {
    job: { ...job, status: "paused", stop_reason: reason, last_tick_at: iso },
    journalLines: [],
    result: "paused",
  };
}

function heartbeatStale(job: JobRow, content: ContentPack, now: number): boolean {
  const timeoutMs = (content.params.afk.onlineHeartbeatTimeoutSec ?? 45) * 1000;
  const hbAt = job.last_heartbeat_at
    ? Date.parse(job.last_heartbeat_at)
    : Date.parse(job.started_at);
  return now - hbAt > timeoutMs;
}

async function settleQuestBattleOnce(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  rewardMult: number,
  journalLines: string[],
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const questId = typeof config.questId === "string" ? config.questId : "";
  const quest = content.quests.find((entry) => entry.id === questId);
  if (!quest) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "所接差事已不在江湖簿中",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  if (job.scheduled_end_at && now >= Date.parse(job.scheduled_end_at)) {
    return finishTerminalJob(client, job, now, {
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
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "这桩差事已变，无法继续行侠",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  const target = content.npcs.find((entry) => entry.id === phase.targetId);
  if (!target || target.kind !== "battle") {
    return finishTerminalJob(client, job, now, {
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
    return finishTerminalJob(client, job, now, {
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
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: reasons[battle.reason ?? "draw"],
      config,
      gains: priorGains,
    });
  }

  const npcRewards = scaledGain(
    {
      exp: target.battleRewards?.exp ?? 0,
      potential: target.battleRewards?.potential ?? 0,
      silver: target.battleRewards?.silver ?? 0,
    },
    rewardMult,
  );
  const nextCounts = { ...progress.counts, [phase.targetId]: killIndex };
  const phaseComplete = killIndex >= phase.count;
  const nextPhase = phaseComplete ? progress.phase + 1 : progress.phase;
  const questComplete = nextPhase >= quest.phases.length;
  const questBonus = questComplete
    ? scaledGain(
        {
          exp: quest.rewards.exp,
          potential: quest.rewards.potential,
          silver: quest.rewards.silver,
        },
        rewardMult,
      )
    : gains();
  const totalGains = gains({
    exp: priorGains.exp + npcRewards.exp + questBonus.exp,
    potential: priorGains.potential + npcRewards.potential + questBonus.potential,
    silver: priorGains.silver + npcRewards.silver + questBonus.silver,
  });

  await client.query(
    "UPDATE characters SET qi = $1, jing = $2, neili = $3, exp = exp + $4, potential = potential + $5, silver = silver + $6 WHERE id = $7",
    [
      battle.combatant.qi,
      battle.combatant.jing,
      battle.combatant.neili,
      toDbInt(npcRewards.exp + questBonus.exp),
      toDbInt(npcRewards.potential + questBonus.potential),
      toDbInt(npcRewards.silver + questBonus.silver),
      job.character_id,
    ],
  );
  for (const drop of battle.drops) {
    await client.query(
      "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, $3)",
      [job.character_id, drop.itemId, drop.count],
    );
  }

  const line = `你寻到${target.name}，与之交手，略有斩获。`;
  journalLines.push(line);
  const nextConfig = appendJournal({ ...config, gains: totalGains }, [line]);

  const nextProgress = { phase: nextPhase, counts: nextCounts };
  if (questComplete) {
    await client.query(
      "UPDATE character_quests SET status = 'reported', progress = $1, completed_at = now(), reported_at = now() WHERE character_id = $2 AND quest_id = $3",
      [JSON.stringify(nextProgress), job.character_id, quest.id],
    );
    return finishTerminalJob(client, job, now, {
      status: "completed",
      phase: "report",
      reason: "差事办妥",
      config: nextConfig,
      gains: totalGains,
    });
  }
  await client.query(
    "UPDATE character_quests SET progress = $1 WHERE character_id = $2 AND quest_id = $3",
    [JSON.stringify(nextProgress), job.character_id, quest.id],
  );
  await client.query(
    "UPDATE afk_jobs SET phase = 'fight', config = $1, last_tick_at = $2, updated_at = now() WHERE id = $3",
    [JSON.stringify(nextConfig), new Date(now).toISOString(), job.id],
  );
  return "settled";
}

async function settleGrindOnce(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
  rewardMult: number,
  journalLines: string[],
  journalSeq: number,
  emitJournal: boolean,
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const jobId = typeof config.jobId === "string" ? config.jobId : "";
  const def = (content.grindJobs ?? []).find((entry) => entry.id === jobId);
  const priorGains = gains(config.gains as ReturnType<typeof gains>);
  if (!def) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "此等杂役已不在册中",
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
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "行止之人已不在此地",
      config,
      gains: priorGains,
    });
  }

  const hourlyGain = scaledGain(def.hourlyGain, rewardMult);
  const settled = settleGrind({
    params: content.params,
    job: stateOf(job, now, priorGains),
    now,
    deltaHours,
    jing: character.jing,
    hourlyGain,
    jingPerHour: def.jingPerHour,
    maxExp: def.maxExp,
    characterExp: character.exp,
  });

  const tickGains = settled.outcome.gained;
  const { applied, nextCarry } = splitApplied(parseCarry(config.carry), {
    exp: tickGains.exp,
    potential: tickGains.potential,
    silver: tickGains.silver,
    jing: settled.jingSpent,
  });
  const totalGains = gains({
    exp: priorGains.exp + tickGains.exp,
    potential: priorGains.potential + tickGains.potential,
    silver: priorGains.silver + tickGains.silver,
  });

  const lines: string[] = [];
  if (emitJournal) {
    const text = grindOnlineLine(def, journalSeq + lines.length);
    lines.push(text);
    journalLines.push(text);
  }

  const nextConfig = appendJournal({ ...config, gains: totalGains, carry: nextCarry }, lines);

  if (applied.exp || applied.potential || applied.silver || applied.jing) {
    await client.query(
      "UPDATE characters SET jing = jing - $1, exp = exp + $2, potential = potential + $3, silver = silver + $4 WHERE id = $5",
      [applied.jing, applied.exp, applied.potential, applied.silver, job.character_id],
    );
  }

  if (settled.outcome.status !== "running") {
    return finishTerminalJob(client, job, now, {
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

async function settleStudyJob(
  client: SqlClient,
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
    return finishTerminalJob(client, job, now, {
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
    toDbInt(settled.jingSpent),
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

async function reloadJob(client: SqlClient, id: string): Promise<JobRow | null> {
  const rows = await client.query<JobRow>(`SELECT ${JOB_COLS} FROM afk_jobs WHERE id = $1`, [id]);
  return rows.rows[0] ?? null;
}

async function settleOnlineLoop(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
): Promise<SettleJobResult> {
  const journalLines: string[] = [];
  let current = job;
  let result: SettleJobResult["result"] = "skipped";
  const tickSec = content.params.afk.onlineTickSec ?? 60;
  const mult = content.params.afk.onlineRewardMult ?? 1.8;
  const tickHours = tickSec / 3600;
  let ticks = 0;

  while (ticks < MAX_ONLINE_TICKS_PER_CALL && current.status === "running") {
    const lastTick = current.last_tick_at
      ? Date.parse(current.last_tick_at)
      : Date.parse(current.started_at);
    if (now - lastTick < tickSec * 1000) break;

    const tickNow = Math.min(now, lastTick + tickSec * 1000);
    let step: "settled" | "completed";
    if (current.kind === "grind") {
      step = await settleGrindOnce(
        client,
        current,
        content,
        tickNow,
        tickHours,
        mult,
        journalLines,
        current.journal_seq + journalLines.length,
        true,
      );
    } else if (current.kind === "quest") {
      step = await settleQuestBattleOnce(client, current, content, tickNow, mult, journalLines);
    } else {
      break;
    }

    ticks += 1;
    if (step === "completed") {
      const refreshed = await reloadJob(client, current.id);
      return {
        job: refreshed ?? current,
        journalLines,
        result: "completed",
      };
    }
    result = "settled";
    const refreshed = await reloadJob(client, current.id);
    if (!refreshed || refreshed.status !== "running") {
      return {
        job: refreshed ?? current,
        journalLines,
        result: refreshed?.status === "paused" ? "paused" : "settled",
      };
    }
    current = refreshed;
  }

  return { job: current, journalLines, result };
}

async function settleOfflineDelta(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  mode: SettleMode,
): Promise<SettleJobResult> {
  const lastTick = job.last_tick_at ? Date.parse(job.last_tick_at) : Date.parse(job.started_at);
  const deltaHours = (now - lastTick) / 3_600_000;
  if (mode !== "stop" && deltaHours <= 0) {
    return { job, journalLines: [], result: "skipped" };
  }
  if (mode === "stop" && deltaHours <= 0) {
    return { job, journalLines: [], result: "skipped" };
  }

  let step: "settled" | "completed";
  if (job.kind === "quest") {
    step = await settleQuestBattleOnce(client, job, content, now, 1, []);
  } else if (job.kind === "grind") {
    step = await settleGrindOnce(
      client,
      job,
      content,
      now,
      deltaHours,
      1,
      [],
      job.journal_seq,
      false,
    );
  } else if (job.kind === "study") {
    step = await settleStudyJob(client, job, content, now, deltaHours);
  } else {
    return { job, journalLines: [], result: "skipped" };
  }

  const refreshed = (await reloadJob(client, job.id)) ?? job;
  return {
    job: refreshed,
    journalLines: [],
    result: step === "completed" ? "completed" : "settled",
  };
}

export async function settleJobNow(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  mode: SettleMode,
): Promise<SettleJobResult> {
  if (job.status !== "running") {
    return { job, journalLines: [], result: "skipped" };
  }

  const presence: AfkPresence =
    job.presence === "online" || job.presence === "offline" ? job.presence : "offline";

  if (presence === "online") {
    if (heartbeatStale(job, content, now)) {
      return pauseForHeartbeat(client, job, now);
    }
    if (mode === "worker") {
      return { job, journalLines: [], result: "skipped" };
    }
    if (mode === "status" || mode === "stop") {
      return settleOnlineLoop(client, job, content, now);
    }
  }

  return settleOfflineDelta(client, job, content, now, mode);
}

export async function stopJobNow(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
): Promise<{ report: AfkReport & { narrative: string }; gains: ReturnType<typeof gains> }> {
  const settled = await settleJobNow(client, job, content, now, "stop");
  const current = settled.job;

  if (current.status === "running") {
    const config = parse<Record<string, unknown>>(current.config);
    const currentGains = gains(config.gains as ReturnType<typeof gains>);
    const cancelled = cancelJob(stateOf(current, now, currentGains), now, "手动停止");
    const report = buildReport(cancelled, now);
    await client.query(
      "UPDATE afk_jobs SET status = 'cancelled', phase = $1, config = $2, last_tick_at = $3, report = $4, stop_reason = $5, updated_at = now() WHERE id = $6",
      [
        cancelled.phase,
        JSON.stringify({ ...config, gains: currentGains }),
        new Date(now).toISOString(),
        JSON.stringify({ ...report, narrative: narrativeFor(current.kind, "cancelled") }),
        "手动停止",
        current.id,
      ],
    );
    return {
      report: { ...report, narrative: narrativeFor(current.kind, "cancelled") },
      gains: currentGains,
    };
  }

  const config = parse<Record<string, unknown>>(current.config);
  const currentGains = gains(config.gains as ReturnType<typeof gains>);
  const terminal = stateOf(current, now, currentGains);
  terminal.status = current.status as AfkJobState["status"];
  terminal.stopReason = current.stop_reason ?? undefined;
  const report = buildReport(terminal, now);
  return {
    report: {
      ...report,
      narrative: narrativeFor(current.kind, current.status),
    },
    gains: currentGains,
  };
}

export async function settleDueJobs(opts: {
  pool: Pool;
  content: ContentPack;
  now?: number;
}): Promise<SettlementSummary> {
  const now = opts.now ?? Date.now();
  const summary: SettlementSummary = {
    scanned: 0,
    settled: 0,
    completed: 0,
    skipped: 0,
    paused: 0,
  };
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
      const outcome = await settleJobNow(client, current, opts.content, now, "worker");
      await client.query("COMMIT");
      if (outcome.result === "completed") summary.completed += 1;
      else if (outcome.result === "settled") summary.settled += 1;
      else if (outcome.result === "paused") summary.paused += 1;
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
