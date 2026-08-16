/**
 * 挂机 UI 数据：服务端权威；客户端只组装意图与展示进度/见闻。
 * DC-043：presence=online|offline；status 带回 progress/gains/journalLines。
 */

import type { SkillRowView } from "./characterTypes.js";
import type { QuestView } from "./questTypes.js";

export interface AfkSkillOption {
  id: string;
  name: string;
  level: number;
}

export interface AfkQuestOption {
  id: string;
  name: string;
  targetName: string;
  /** 每次完整办妥并交差时的固定奖励，由任务内容包定义。 */
  roundGain: AfkGains;
}

/** 保留给论剑模板选择器；自动行侠不再使用。 */
export interface AfkTemplateOption {
  id: string;
  name: string;
}

export interface AfkGrindOption {
  id: string;
  name: string;
  description: string;
  maxExp: number;
  hourlyGain: AfkGains;
  jingPerHour: number;
  roundGain?: AfkGains;
  jingPerRound?: number;
}

export type AfkPresence = "online" | "offline";

export type AfkStartConfig =
  | {
      kind: "practice";
      presence: "offline";
      durationMinutes: number;
      config: { skillId: string };
    }
  | {
      kind: "dazuo";
      presence: "offline";
      durationMinutes: number;
      config: Record<string, never>;
    }
  | {
      kind: "tuna";
      presence: "offline";
      durationMinutes: number;
      config: Record<string, never>;
    }
  | {
      kind: "quest";
      presence: "online";
      config: { questId: string };
    }
  | {
      kind: "grind";
      presence: AfkPresence;
      durationMinutes?: number;
      config: { jobId: string };
    };

export interface AfkGains {
  exp: number;
  potential: number;
  silver: number;
}

export interface AfkJobData {
  id: string;
  kind: "practice" | "dazuo" | "tuna" | "study" | "quest" | "grind";
  presence: AfkPresence;
  status: string;
  phase: string;
  startedAt: string;
  scheduledEndAt: string | null;
  stopReason?: string;
  gains: AfkGains;
  progress: number;
  elapsedMs: number;
  totalMs: number;
  journalLines: string[];
  config: Record<string, unknown>;
  roomId?: string;
  grindPhase?: string;
  rounds?: number;
  /** 在线自动行侠抵达目标后，由客户端拉起可手动操作的战局。 */
  questCombatTargetId?: string;
}

export type AfkStatusResponse = AfkJobData | { active: false };

export interface AfkStatusView {
  active: boolean;
  paused: boolean;
  message: string;
  reason?: string;
  presence?: AfkPresence;
  progress: number;
  gains: AfkGains;
  journalLines: string[];
  roomId?: string;
  grindPhase?: string;
  rounds?: number;
  /** 在线生计/自动行侠无固定结束时间，直到玩家停止或离开游戏。 */
  openEnded: boolean;
  /** 在线挂机 running（含生计跑图）时锁出口。 */
  lockExits: boolean;
  questCombatTargetId?: string;
}

export interface AfkReportData {
  jobId: string;
  kind: string;
  status: "completed" | "failed" | "cancelled";
  reason?: string;
  durationMinutes: number;
  gains: AfkGains;
  narrative: string;
}

export function toAfkSkillOptions(skills: SkillRowView[]): AfkSkillOption[] {
  return skills.map(({ id, name, level }) => ({ id, name, level }));
}

export function toAfkQuestOptions(quests: QuestView[]): AfkQuestOption[] {
  return quests.flatMap((quest) => {
    if (quest.state !== "available" || !quest.autoUnlocked) return [];
    const first = quest.phases[0];
    return [
      {
        id: quest.id,
        name: quest.name,
        targetName: first?.targetName ?? "差事",
        roundGain: quest.rewards,
      },
    ];
  });
}

export function toAfkStatusView(status: AfkStatusResponse): AfkStatusView {
  if ("active" in status) {
    return {
      active: false,
      paused: false,
      message: "",
      progress: 0,
      gains: { exp: 0, potential: 0, silver: 0 },
      journalLines: [],
      openEnded: false,
      lockExits: false,
    };
  }

  const end = status.scheduledEndAt ? Date.parse(status.scheduledEndAt) : NaN;
  const shichen = Number.isFinite(end)
    ? Math.max(0, Math.round(((end - Date.now()) / 7_200_000) * 10) / 10)
    : null;
  const suffix = shichen === null ? "" : shichen > 0 ? ` · 约余 ${shichen} 时辰` : " · 正待结算";
  const kindLabel =
    status.kind === "practice"
      ? "练功途中"
      : status.kind === "dazuo"
        ? "打坐途中"
        : status.kind === "tuna"
          ? "吐纳途中"
          : status.kind === "study"
            ? "练功途中"
            : status.kind === "quest"
              ? "行侠途中"
              : "生计途中";
  const presenceLabel = status.presence === "online" ? "在线" : "离线";
  const paused = status.status === "paused";
  const grindPhase = status.grindPhase;
  const rounds = status.rounds ?? 0;
  let phaseHint = "";
  if (status.kind === "grind" && status.presence === "online" && !paused) {
    if (grindPhase === "goto_hub") phaseHint = " · 赶往村口";
    else if (status.phase === "work") phaseHint = " · 干活中";
    else if (status.phase === "harvest") phaseHint = ` · 已入账 ${rounds} 轮`;
    else if (grindPhase === "circuit")
      phaseHint = rounds > 0 ? ` · 第 ${rounds + 1} 圈` : " · 巡回中";
  } else if (status.kind === "quest" && status.presence === "online" && !paused) {
    if (status.phase === "battle") phaseHint = " · 敌踪已现，待你应战";
    else if (status.phase === "accept") phaseHint = " · 前往接令";
    else if (status.phase === "route") phaseHint = " · 赶路中";
    else if (status.phase === "task") phaseHint = " · 办差中";
    if (rounds > 0) phaseHint += ` · 已办妥 ${rounds} 趟`;
  }
  const lockExits = status.presence === "online" && status.status === "running";
  return {
    active: status.status === "running" || paused,
    paused,
    message: paused
      ? (status.stopReason ?? "气息中断，挂机暂歇")
      : `${presenceLabel}${kindLabel}${phaseHint}${suffix}`,
    ...(status.stopReason ? { reason: status.stopReason } : {}),
    presence: status.presence,
    progress: status.progress ?? 0,
    gains: status.gains ?? { exp: 0, potential: 0, silver: 0 },
    journalLines: status.journalLines ?? [],
    ...(status.roomId ? { roomId: status.roomId } : {}),
    ...(grindPhase ? { grindPhase } : {}),
    ...(status.questCombatTargetId ? { questCombatTargetId: status.questCombatTargetId } : {}),
    rounds,
    openEnded: status.presence === "online" && !status.scheduledEndAt,
    lockExits,
  };
}
