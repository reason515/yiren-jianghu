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
}

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
      presence: AfkPresence;
      templateId?: string;
      durationMinutes: number;
      config: { questId: string };
    }
  | {
      kind: "grind";
      presence: AfkPresence;
      durationMinutes: number;
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
  scheduledEndAt: string;
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
  /** 在线挂机 running（含生计跑图）时锁出口。 */
  lockExits: boolean;
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
    if (quest.state !== "accepted") return [];
    const current = quest.phases.find((phase) => !phase.done);
    if (!current || current.type !== "kill") return [];
    return [{ id: quest.id, name: quest.name, targetName: current.targetName }];
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
      lockExits: false,
    };
  }

  const end = Date.parse(status.scheduledEndAt);
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
  }
  const lockExits = status.presence === "online" && status.status === "running";
  return {
    active: status.status === "running" || paused,
    paused,
    message: paused
      ? (status.stopReason ?? "气息中断，行止暂歇")
      : `${presenceLabel}${kindLabel}${phaseHint}${suffix}`,
    ...(status.stopReason ? { reason: status.stopReason } : {}),
    presence: status.presence,
    progress: status.progress ?? 0,
    gains: status.gains ?? { exp: 0, potential: 0, silver: 0 },
    journalLines: status.journalLines ?? [],
    ...(status.roomId ? { roomId: status.roomId } : {}),
    ...(grindPhase ? { grindPhase } : {}),
    rounds,
    lockExits,
  };
}
