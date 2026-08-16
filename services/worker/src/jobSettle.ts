import type { Pool } from "pg";
import {
  advanceOnlineGrind,
  afkAttemptsPerHour,
  buildGraph,
  findPath,
  buildReport,
  cancelJob,
  circuitStepsTotal,
  initialGrindCircuitState,
  processTick,
  type AfkJobState,
  type AfkReport,
  type GrindCircuitDef,
  type GrindCircuitState,
  type SkillMap,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import { attemptsForHours, settleDazuo, settlePractice, settleTuna } from "./settlement.js";
import { settleQuestBattle } from "./questSettlement.js";
import { settleGrind } from "./grindSettlement.js";

/**
 * DC-043 挂机结算：离线按时长推进；在线短轮回 + 心跳 pause；status/stop/worker 分模式。
 */
export type AfkPresence = "online" | "offline";
export type SettleMode = "worker" | "status" | "stop" | "start";

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

async function stopForHeartbeat(
  client: SqlClient,
  job: JobRow,
  now: number,
): Promise<SettleJobResult> {
  const reason = "已离开江湖，本次挂机自动停止";
  const config = parse<Record<string, unknown>>(job.config);
  const currentGains = gains(config.gains as ReturnType<typeof gains>);
  await finishTerminalJob(client, job, now, {
    status: "cancelled",
    phase: "cancelled",
    reason,
    config,
    gains: currentGains,
  });
  return {
    job: { ...job, status: "cancelled", stop_reason: reason },
    journalLines: [],
    result: "completed",
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

/** 自动行侠的非战斗步骤。战斗仍复用 PVE 会话，由玩家在战局中选择回气与绝招。 */
async function settleQuestRouteOnce(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  journalLines: string[],
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const questId = typeof config.questId === "string" ? config.questId : "";
  const quest = content.quests.find((entry) => entry.id === questId);
  if (!quest) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "这桩熟悉的差事已不在江湖簿中",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  const characterRows = await client.query<{
    id: string;
    room_path: string;
    qi: number;
    jing: number;
    eff_qi: number;
    eff_jing: number;
  }>("SELECT id, room_path, qi, jing, eff_qi, eff_jing FROM characters WHERE id = $1", [
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
  const roomOfTarget = (targetId: string): string | undefined =>
    content.rooms.find(
      (room) =>
        room.id === targetId || room.npcIds.includes(targetId) || room.itemIds.includes(targetId),
    )?.id;
  const graph = buildGraph(
    content.rooms.map((room) => ({
      id: room.id,
      exits: Object.fromEntries(room.exits.map((exit) => [exit.dir, exit.roomId])),
    })),
  );
  const moveOne = async (targetRoomId: string, line: string): Promise<boolean> => {
    if (character.room_path === targetRoomId) return true;
    const path = findPath(graph, character.room_path, targetRoomId);
    if (!path.ok || path.path.length === 0) {
      await finishTerminalJob(client, job, now, {
        status: "failed",
        phase: "failed",
        reason: "前路不通，自动行侠只得停下",
        config,
        gains: gains(config.gains as ReturnType<typeof gains>),
      });
      return false;
    }
    const step = path.path[0]!;
    await client.query("UPDATE characters SET room_path = $1 WHERE id = $2", [
      step.to,
      character.id,
    ]);
    journalLines.push(line);
    await client.query(
      "UPDATE afk_jobs SET phase = $1, last_tick_at = $2, config = $3, updated_at = now() WHERE id = $4",
      ["route", new Date(now).toISOString(), JSON.stringify(appendJournal(config, [line])), job.id],
    );
    return false;
  };
  const persist = async (
    phase: string,
    next: Record<string, unknown>,
    lines: string[] = [],
  ): Promise<"settled"> => {
    await client.query(
      "UPDATE afk_jobs SET phase = $1, config = $2, last_tick_at = $3, updated_at = now() WHERE id = $4",
      [phase, JSON.stringify(appendJournal(next, lines)), new Date(now).toISOString(), job.id],
    );
    return "settled";
  };

  // 战局开启后不再替玩家推进；战局结束后下一拍恢复任务流程，并在低气血时先歇脚。
  if (job.phase === "battle") {
    const started = config.combatStarted === true;
    const sessions = await client.query<{ status: string }>(
      "SELECT status FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing' LIMIT 1",
      [character.id],
    );
    if (!started && sessions.rows[0]) return persist("battle", { ...config, combatStarted: true });
    if (!started) return "settled";
    if (sessions.rows[0]) return "settled";
    return persist("task", { ...config, combatStarted: false, combatTargetId: null });
  }

  // 气或精低于伤势上限 35% 时，先走至最近的可歇脚房间；到店后恢复至当前伤势上限。
  if (character.qi < character.eff_qi * 0.35 || character.jing < character.eff_jing * 0.35) {
    const inns = content.rooms.filter((room) => room.canSleep).map((room) => room.id);
    const reachable = inns
      .map((id) => ({ id, path: findPath(graph, character.room_path, id) }))
      .filter((entry) => entry.path.ok)
      .sort((a, b) => (a.path.ok ? a.path.path.length : 0) - (b.path.ok ? b.path.path.length : 0));
    const inn = reachable[0]?.id;
    if (inn && character.room_path !== inn) {
      await moveOne(inn, "伤势未复，先往客栈歇脚。");
      return "settled";
    }
    if (inn) {
      await client.query("UPDATE characters SET qi = eff_qi, jing = eff_jing WHERE id = $1", [
        character.id,
      ]);
      const line = "在客栈歇过一阵，气血已复，继续赶路。";
      journalLines.push(line);
      return persist("task", config, [line]);
    }
  }

  const records = await client.query<{
    status: "accepted" | "completed" | "reported";
    progress: unknown;
  }>("SELECT status, progress FROM character_quests WHERE character_id = $1 AND quest_id = $2", [
    character.id,
    quest.id,
  ]);
  const record = records.rows[0];
  if (!record || record.status === "reported") {
    const acceptNpcId = quest.automation.acceptNpcId;
    const acceptRoom = acceptNpcId ? roomOfTarget(acceptNpcId) : undefined;
    if (acceptRoom && !(await moveOne(acceptRoom, "循着旧路，前去接下差事。"))) return "settled";
    await client.query(
      "INSERT INTO character_quests (character_id, quest_id, status, progress, accepted_at, completed_at, reported_at) VALUES ($1,$2,'accepted',$3,now(),NULL,NULL) ON CONFLICT (character_id, quest_id) DO UPDATE SET status = 'accepted', progress = EXCLUDED.progress, accepted_at = now(), completed_at = NULL, reported_at = NULL",
      [character.id, quest.id, JSON.stringify({ phase: 0, counts: {} })],
    );
    const line = `接下「${quest.name}」，循例办事。`;
    journalLines.push(line);
    return persist("task", config, [line]);
  }
  const progress = parse<QuestProgress>(record.progress);
  if (record.status === "completed" || progress.phase >= quest.phases.length) {
    const reportNpcId = quest.automation.reportNpcId;
    const reportRoom = reportNpcId ? roomOfTarget(reportNpcId) : undefined;
    if (reportRoom && !(await moveOne(reportRoom, "事已办妥，返程交差。"))) return "settled";
    const prior = gains(config.gains as ReturnType<typeof gains>);
    const total = gains({
      exp: prior.exp + quest.rewards.exp,
      potential: prior.potential + quest.rewards.potential,
      silver: prior.silver + quest.rewards.silver,
    });
    await client.query(
      "UPDATE characters SET exp = exp + $1, potential = potential + $2, silver = silver + $3 WHERE id = $4",
      [quest.rewards.exp, quest.rewards.potential, quest.rewards.silver, character.id],
    );
    await client.query(
      "UPDATE character_quests SET status = 'reported', reported_at = now() WHERE character_id = $1 AND quest_id = $2",
      [character.id, quest.id],
    );
    const rounds = (typeof config.rounds === "number" ? config.rounds : 0) + 1;
    const line = `交差已毕：${quest.name}第 ${rounds} 趟的酬谢已入囊。`;
    journalLines.push(line);
    return persist("accept", { ...config, gains: total, rounds, combatTargetId: null }, [line]);
  }
  const phase = quest.phases[progress.phase];
  if (!phase) return "settled";
  const targetRoom = roomOfTarget(phase.targetId);
  if (!targetRoom) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "差事目标无处可寻",
      config,
      gains: gains(config.gains as ReturnType<typeof gains>),
    });
  }
  if (!(await moveOne(targetRoom, `循着线索赶往${targetRoom}。`))) return "settled";
  if (phase.type === "kill") {
    const line = "敌踪已现，待你亲自应战。";
    journalLines.push(line);
    return persist("battle", { ...config, combatTargetId: phase.targetId, combatStarted: false }, [
      line,
    ]);
  }
  // talk/goto/collect/deliver 均以任务相位为准推进；后续任务类型只需在这里补其受控场景动作。
  const counts = {
    ...progress.counts,
    [phase.targetId]: (progress.counts[phase.targetId] ?? 0) + 1,
  };
  const required = "count" in phase ? phase.count : 1;
  const enough = (counts[phase.targetId] ?? 0) >= required;
  const nextProgress = { phase: enough ? progress.phase + 1 : progress.phase, counts };
  await client.query(
    "UPDATE character_quests SET progress = $1, status = $2, completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END WHERE character_id = $3 AND quest_id = $4",
    [
      JSON.stringify(nextProgress),
      nextProgress.phase >= quest.phases.length ? "completed" : "accepted",
      character.id,
      quest.id,
    ],
  );
  const line = `按差事所托办妥一件：${phase.type === "talk" ? "问讯" : "赶路"}。`;
  journalLines.push(line);
  return persist("task", config, [line]);
}

function grindCircuitDefOf(def: {
  hubRoomId?: string;
  route: string[];
  workRooms: string[];
  navWhitelist: string[];
  moveLines?: string[];
  workLines?: string[];
  harvestLine?: string;
  onlineLines?: string[];
}): GrindCircuitDef | null {
  if (!def.hubRoomId || def.route.length < 2) return null;
  return {
    hubRoomId: def.hubRoomId,
    route: def.route,
    workRooms: def.workRooms,
    navWhitelist: def.navWhitelist,
    moveLines: def.moveLines,
    workLines: def.workLines,
    harvestLine: def.harvestLine,
    onlineLines: def.onlineLines,
  };
}

function readCircuitState(
  config: Record<string, unknown>,
  roomId: string,
  circuit: GrindCircuitDef,
): GrindCircuitState {
  const phase = config.phase === "circuit" || config.phase === "goto_hub" ? config.phase : null;
  if (!phase) return initialGrindCircuitState(roomId, circuit);
  return {
    phase,
    roomId,
    routeIndex: typeof config.routeIndex === "number" ? config.routeIndex : 0,
    pendingWork: typeof config.pendingWork === "number" ? config.pendingWork : 0,
    rounds: typeof config.rounds === "number" ? config.rounds : 0,
    lineSeq: typeof config.lineSeq === "number" ? config.lineSeq : 0,
  };
}

function writeCircuitConfig(
  config: Record<string, unknown>,
  state: GrindCircuitState,
): Record<string, unknown> {
  return {
    ...config,
    phase: state.phase,
    routeIndex: state.routeIndex,
    pendingWork: state.pendingWork,
    rounds: state.rounds,
    lineSeq: state.lineSeq,
  };
}

async function settleGrindOnlineOnce(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  rewardMult: number,
  journalLines: string[],
  def: NonNullable<ContentPack["grindJobs"]>[number],
  circuit: GrindCircuitDef,
  config: Record<string, unknown>,
  priorGains: ReturnType<typeof gains>,
): Promise<"settled" | "completed"> {
  if (job.scheduled_end_at && now >= Date.parse(job.scheduled_end_at)) {
    return finishTerminalJob(client, job, now, {
      status: "completed",
      phase: "done",
      reason: "日头偏西，杂役已毕",
      config,
      gains: priorGains,
    });
  }

  const charRows = await client.query<{ jing: number; exp: number; room_path: string }>(
    "SELECT jing, exp, room_path FROM characters WHERE id = $1",
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

  if (def.maxExp > 0 && character.exp >= def.maxExp) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "历练已够，此等杂役再做无益",
      config,
      gains: priorGains,
    });
  }

  const graph = buildGraph(
    content.rooms.map((room) => ({
      id: room.id,
      exits: Object.fromEntries(room.exits.map((e) => [e.dir, e.roomId])),
    })),
  );
  const before = readCircuitState(config, character.room_path, circuit);
  const step = advanceOnlineGrind(graph, circuit, before);

  if (step.action === "stuck") {
    journalLines.push(step.journalLine);
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: step.journalLine,
      config: appendJournal(writeCircuitConfig(config, step.state), [step.journalLine]),
      gains: priorGains,
    });
  }

  if (step.roomId !== character.room_path) {
    await client.query("UPDATE characters SET room_path = $1 WHERE id = $2", [
      step.roomId,
      job.character_id,
    ]);
  }

  let totalGains = priorGains;
  let jingSpent = 0;
  let exhausted = false;

  if (step.harvested && def.roundGain) {
    const jingNeed = def.jingPerRound;
    if (jingNeed > 0 && character.jing <= 0) {
      exhausted = true;
    } else {
      jingSpent = Math.min(character.jing, jingNeed);
      const raw = {
        exp: def.roundGain.exp * rewardMult,
        potential: def.roundGain.potential * rewardMult,
        silver: def.roundGain.silver * rewardMult,
      };
      const { applied, nextCarry } = splitApplied(parseCarry(config.carry), {
        exp: raw.exp,
        potential: raw.potential,
        silver: raw.silver,
        jing: jingSpent,
      });
      totalGains = gains({
        exp: priorGains.exp + raw.exp,
        potential: priorGains.potential + raw.potential,
        silver: priorGains.silver + raw.silver,
      });
      config = { ...config, carry: nextCarry };
      if (applied.exp || applied.potential || applied.silver || applied.jing) {
        await client.query(
          "UPDATE characters SET jing = jing - $1, exp = exp + $2, potential = potential + $3, silver = silver + $4 WHERE id = $5",
          [applied.jing, applied.exp, applied.potential, applied.silver, job.character_id],
        );
      }
      if (jingNeed > 0 && character.jing - jingSpent <= 0) exhausted = true;
    }
  }

  journalLines.push(step.journalLine);
  let roundSteps = typeof config.roundSteps === "number" ? config.roundSteps : 0;
  if (step.state.phase === "circuit" && !step.harvested) {
    roundSteps += 1;
  } else if (step.harvested) {
    roundSteps = 0;
  }
  let nextConfig = appendJournal({ ...writeCircuitConfig(config, step.state), roundSteps }, [
    step.journalLine,
  ]);
  nextConfig = { ...nextConfig, gains: totalGains };

  if (exhausted) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "精疲力尽，此事只好暂且放下",
      config: nextConfig,
      gains: totalGains,
    });
  }

  const phaseLabel =
    step.state.phase === "goto_hub"
      ? "goto_hub"
      : step.action === "work"
        ? "work"
        : step.harvested
          ? "harvest"
          : "circuit";

  await client.query(
    "UPDATE afk_jobs SET phase = $1, config = $2, last_tick_at = $3, updated_at = now() WHERE id = $4",
    [phaseLabel, JSON.stringify(nextConfig), new Date(now).toISOString(), job.id],
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

  const circuit = grindCircuitDefOf(def);
  if (job.presence === "online" && circuit) {
    return settleGrindOnlineOnce(
      client,
      job,
      content,
      now,
      rewardMult,
      journalLines,
      def,
      circuit,
      config,
      priorGains,
    );
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

async function applyPartialCircuitReward(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  config: Record<string, unknown>,
  priorGains: ReturnType<typeof gains>,
  rewardMult: number,
): Promise<{ config: Record<string, unknown>; gains: ReturnType<typeof gains> }> {
  const jobId = typeof config.jobId === "string" ? config.jobId : "";
  const def = (content.grindJobs ?? []).find((entry) => entry.id === jobId);
  const roundSteps = typeof config.roundSteps === "number" ? config.roundSteps : 0;
  if (!def?.roundGain || roundSteps <= 0) {
    return { config, gains: priorGains };
  }
  const circuit = grindCircuitDefOf(def);
  if (!circuit) return { config, gains: priorGains };
  const total = circuitStepsTotal(circuit);
  const fraction = Math.min(1, roundSteps / total);
  if (fraction <= 0) return { config, gains: priorGains };

  const charRows = await client.query<{ jing: number }>(
    "SELECT jing FROM characters WHERE id = $1",
    [job.character_id],
  );
  const jing = charRows.rows[0]?.jing ?? 0;
  const jingNeed = Math.max(0, Math.ceil((def.jingPerRound ?? 0) * fraction));
  if (jingNeed > 0 && jing <= 0) return { config, gains: priorGains };

  const raw = {
    exp: def.roundGain.exp * fraction * rewardMult,
    potential: def.roundGain.potential * fraction * rewardMult,
    silver: def.roundGain.silver * fraction * rewardMult,
  };
  const jingSpent = Math.min(jing, jingNeed);
  const { applied, nextCarry } = splitApplied(parseCarry(config.carry), {
    exp: raw.exp,
    potential: raw.potential,
    silver: raw.silver,
    jing: jingSpent,
  });
  const totalGains = gains({
    exp: priorGains.exp + raw.exp,
    potential: priorGains.potential + raw.potential,
    silver: priorGains.silver + raw.silver,
  });
  if (applied.exp || applied.potential || applied.silver || applied.jing) {
    await client.query(
      "UPDATE characters SET jing = jing - $1, exp = exp + $2, potential = potential + $3, silver = silver + $4 WHERE id = $5",
      [applied.jing, applied.exp, applied.potential, applied.silver, job.character_id],
    );
  }
  return {
    config: { ...config, gains: totalGains, carry: nextCarry, roundSteps: 0 },
    gains: totalGains,
  };
}

async function settlePracticeJob(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
): Promise<"settled" | "completed"> {
  const config = parse<{ skillId?: string; cultivation?: Record<string, unknown> }>(job.config);
  const skillId = config.skillId ?? "";
  const skillDef = content.skills.find((skill) => skill.id === skillId);
  if (!skillDef) {
    const outcome = processTick({
      job: stateOf(job, now),
      params: content.params,
      now,
      deltaHours,
      hourlyGain: gains(),
      failure: "练功目标缺失",
    });
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: outcome.job.phase,
      reason: outcome.job.stopReason ?? "练功目标缺失",
      config: config as Record<string, unknown>,
      gains: gains(),
    });
  }
  const charRows = await client.query<{ qi: number }>("SELECT qi FROM characters WHERE id = $1", [
    job.character_id,
  ]);
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

  const kind = job.kind === "study" ? "study" : "practice";
  const settled = settlePractice({
    params: content.params,
    qi: charRows.rows[0]?.qi ?? 0,
    skillId,
    skills: skillMap,
    maxLevel: skillDef.maxLevel,
    attempts: attemptsForHours(deltaHours, afkAttemptsPerHour(content.params, kind)),
  });

  const outcome = processTick({
    job: stateOf(job, now),
    params: content.params,
    now,
    deltaHours,
    hourlyGain: gains(),
  });

  await client.query("UPDATE characters SET qi = qi - $1 WHERE id = $2", [
    toDbInt(settled.qiSpent),
    job.character_id,
  ]);
  const progress = settled.skills[skillId];
  if (progress) {
    await client.query(
      "INSERT INTO character_skills (character_id, skill_id, level, practice_points) VALUES ($1, $2, $3, $4) ON CONFLICT (character_id, skill_id) DO UPDATE SET level = EXCLUDED.level, practice_points = EXCLUDED.practice_points",
      [job.character_id, skillId, progress.level, progress.practicePoints],
    );
  }

  const cultivation = {
    skillId,
    attempts: settled.attempts,
    levelsGained: settled.levelsGained,
    practicePoints: progress?.practicePoints ?? 0,
  };
  const nextConfig = { ...config, cultivation };

  const done = outcome.status !== "running";
  const report = done ? buildReport(outcome.job, now) : null;
  await client.query(
    "UPDATE afk_jobs SET status = $1, phase = $2, day = $3, hours_today = $4, last_tick_at = $5, config = $6, report = $7, stop_reason = $8, updated_at = now() WHERE id = $9",
    [
      outcome.job.status,
      outcome.job.phase,
      outcome.job.day,
      outcome.job.hoursToday,
      new Date(now).toISOString(),
      JSON.stringify(nextConfig),
      report
        ? JSON.stringify({ ...report, narrative: narrativeFor(job.kind, outcome.job.status) })
        : null,
      outcome.job.stopReason ?? null,
      job.id,
    ],
  );
  return done ? "completed" : "settled";
}

async function settleDazuoJob(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const charRows = await client.query<{
    qi: number;
    neili: number;
    jingli: number;
  }>("SELECT qi, neili, jingli FROM characters WHERE id = $1", [job.character_id]);
  const character = charRows.rows[0];
  if (!character) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "行止之人已不在此地",
      config,
      gains: gains(),
    });
  }
  const forceRow = await client.query<{ level: number }>(
    "SELECT level FROM character_skills WHERE character_id = $1 AND skill_id = 'basic_force'",
    [job.character_id],
  );
  const forceLevel = forceRow.rows[0]?.level ?? 0;
  const maxNeili = content.params.vitals.neiliPerLevel * Math.max(1, forceLevel);

  const settled = settleDazuo({
    params: content.params,
    qi: character.qi,
    neili: character.neili,
    maxNeili,
    forceLevel,
    attempts: attemptsForHours(deltaHours, afkAttemptsPerHour(content.params, "dazuo")),
  });

  const outcome = processTick({
    job: stateOf(job, now),
    params: content.params,
    now,
    deltaHours,
    hourlyGain: gains(),
  });

  await client.query("UPDATE characters SET qi = qi - $1, neili = $2 WHERE id = $3", [
    toDbInt(settled.qiSpent),
    settled.neili,
    job.character_id,
  ]);

  const nextConfig = {
    ...config,
    cultivation: {
      neiliGained: settled.neiliGained,
      maxNeiliUp: settled.maxNeiliUp,
      attempts: settled.attempts,
    },
  };

  const done = outcome.status !== "running";
  const report = done ? buildReport(outcome.job, now) : null;
  await client.query(
    "UPDATE afk_jobs SET status = $1, phase = $2, day = $3, hours_today = $4, last_tick_at = $5, config = $6, report = $7, stop_reason = $8, updated_at = now() WHERE id = $9",
    [
      outcome.job.status,
      outcome.job.phase,
      outcome.job.day,
      outcome.job.hoursToday,
      new Date(now).toISOString(),
      JSON.stringify(nextConfig),
      report
        ? JSON.stringify({ ...report, narrative: narrativeFor(job.kind, outcome.job.status) })
        : null,
      outcome.job.stopReason ?? null,
      job.id,
    ],
  );
  return done ? "completed" : "settled";
}

async function settleTunaJob(
  client: SqlClient,
  job: JobRow,
  content: ContentPack,
  now: number,
  deltaHours: number,
): Promise<"settled" | "completed"> {
  const config = parse<Record<string, unknown>>(job.config);
  const charRows = await client.query<{ jing: number; jingli: number }>(
    "SELECT jing, jingli FROM characters WHERE id = $1",
    [job.character_id],
  );
  const character = charRows.rows[0];
  if (!character) {
    return finishTerminalJob(client, job, now, {
      status: "failed",
      phase: "failed",
      reason: "行止之人已不在此地",
      config,
      gains: gains(),
    });
  }
  const forceRow = await client.query<{ level: number }>(
    "SELECT level FROM character_skills WHERE character_id = $1 AND skill_id = 'basic_force'",
    [job.character_id],
  );
  const forceLevel = forceRow.rows[0]?.level ?? 0;
  const maxJingli =
    content.params.vitals.jingliBase + forceLevel * content.params.vitals.jingliPerLevel;

  const settled = settleTuna({
    params: content.params,
    jing: character.jing,
    jingli: character.jingli,
    maxJingli,
    forceLevel,
    attempts: attemptsForHours(deltaHours, afkAttemptsPerHour(content.params, "tuna")),
  });

  const outcome = processTick({
    job: stateOf(job, now),
    params: content.params,
    now,
    deltaHours,
    hourlyGain: gains(),
  });

  await client.query("UPDATE characters SET jing = jing - $1, jingli = $2 WHERE id = $3", [
    toDbInt(settled.jingSpent),
    settled.jingli,
    job.character_id,
  ]);

  const nextConfig = {
    ...config,
    cultivation: {
      jingliGained: settled.jingliGained,
      maxJingliUp: settled.maxJingliUp,
      attempts: settled.attempts,
    },
  };

  const done = outcome.status !== "running";
  const report = done ? buildReport(outcome.job, now) : null;
  await client.query(
    "UPDATE afk_jobs SET status = $1, phase = $2, day = $3, hours_today = $4, last_tick_at = $5, config = $6, report = $7, stop_reason = $8, updated_at = now() WHERE id = $9",
    [
      outcome.job.status,
      outcome.job.phase,
      outcome.job.day,
      outcome.job.hoursToday,
      new Date(now).toISOString(),
      JSON.stringify(nextConfig),
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
  const tickSec =
    current.kind === "quest"
      ? (content.params.afk.questOnlineTickSec ?? 30)
      : (content.params.afk.onlineTickSec ?? 15);
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
      step = await settleQuestRouteOnce(client, current, content, tickNow, journalLines);
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
  } else if (job.kind === "study" || job.kind === "practice") {
    step = await settlePracticeJob(client, job, content, now, deltaHours);
  } else if (job.kind === "dazuo") {
    step = await settleDazuoJob(client, job, content, now, deltaHours);
  } else if (job.kind === "tuna") {
    step = await settleTunaJob(client, job, content, now, deltaHours);
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
      return stopForHeartbeat(client, job, now);
    }
    if (mode === "worker") {
      return { job, journalLines: [], result: "skipped" };
    }
    if (mode === "status" || mode === "stop" || mode === "start") {
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
  let current = settled.job;

  if (current.status === "running") {
    const config = parse<Record<string, unknown>>(current.config);
    const priorGains = gains(config.gains as ReturnType<typeof gains>);
    if (
      current.presence === "online" &&
      current.kind === "grind" &&
      typeof config.roundSteps === "number" &&
      config.roundSteps > 0
    ) {
      const mult = content.params.afk.onlineRewardMult ?? 1.8;
      const partial = await applyPartialCircuitReward(
        client,
        current,
        content,
        config,
        priorGains,
        mult,
      );
      await client.query("UPDATE afk_jobs SET config = $1 WHERE id = $2", [
        JSON.stringify(partial.config),
        current.id,
      ]);
      current = { ...current, config: partial.config };
    }
    const currentConfig = parse<Record<string, unknown>>(current.config);
    const currentGains = gains(currentConfig.gains as ReturnType<typeof gains>);
    const cancelled = cancelJob(stateOf(current, now, currentGains), now, "你停了手头的活计");
    const report = buildReport(cancelled, now);
    await client.query(
      "UPDATE afk_jobs SET status = 'cancelled', phase = $1, config = $2, last_tick_at = $3, report = $4, stop_reason = $5, updated_at = now() WHERE id = $6",
      [
        cancelled.phase,
        JSON.stringify({ ...currentConfig, gains: currentGains }),
        new Date(now).toISOString(),
        JSON.stringify({ ...report, narrative: narrativeFor(current.kind, "cancelled") }),
        "你停了手头的活计",
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
    if (
      job.kind !== "study" &&
      job.kind !== "practice" &&
      job.kind !== "dazuo" &&
      job.kind !== "tuna" &&
      job.kind !== "quest" &&
      job.kind !== "grind"
    ) {
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
