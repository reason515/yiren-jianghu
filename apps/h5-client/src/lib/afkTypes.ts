import type { SkillRowView } from "./characterTypes.js";
import type { QuestView } from "./questTypes.js";

/**
 * 挂机 UI 数据：服务端是作业、结算和战报的唯一事实来源；客户端只组装受控意图。
 * 修炼（study）与行侠（quest）均已由 Worker 实际结算（行侠见 DC-026）。
 */

export interface AfkSkillOption {
  id: string;
  name: string;
  level: number;
}

/** 行侠挂机可选差事：已接且当前相位为击杀。 */
export interface AfkQuestOption {
  id: string;
  name: string;
  /** 当前要会一会的对象（击杀目标名）。 */
  targetName: string;
}

/** 行侠挂机可选战术模板。 */
export interface AfkTemplateOption {
  id: string;
  name: string;
}

export type AfkStartConfig =
  | { kind: "study"; durationMinutes: number; config: { skillId: string } }
  | {
      kind: "quest";
      templateId: string;
      durationMinutes: number;
      config: { questId: string };
    };

export interface AfkJobData {
  id: string;
  kind: "study" | "quest";
  status: string;
  phase: string;
  startedAt: string;
  scheduledEndAt: string;
  stopReason?: string;
  gains: AfkGains;
  config: Record<string, unknown>;
}

export type AfkStatusResponse = AfkJobData | { active: false };

export interface AfkStatusView {
  active: boolean;
  message: string;
  reason?: string;
}

export interface AfkGains {
  exp: number;
  potential: number;
  silver: number;
}

export interface AfkReportData {
  jobId: string;
  kind: string;
  status: "completed" | "failed" | "cancelled";
  reason?: string;
  durationMinutes: number;
  gains: AfkGains;
  /** 叙事化战报（wuxia 文案，服务端生成）。 */
  narrative: string;
}

export function toAfkSkillOptions(skills: SkillRowView[]): AfkSkillOption[] {
  return skills.map(({ id, name, level }) => ({ id, name, level }));
}

/** 从已接任务中筛出行侠可自动了结的差事（当前相位为击杀）。 */
export function toAfkQuestOptions(quests: QuestView[]): AfkQuestOption[] {
  return quests.flatMap((quest) => {
    if (quest.state !== "accepted") return [];
    const current = quest.phases.find((phase) => !phase.done);
    if (!current || current.type !== "kill") return [];
    return [{ id: quest.id, name: quest.name, targetName: current.targetName }];
  });
}

/** 将服务端作业快照化为不泄漏内部 phase 的场景状态条。 */
export function toAfkStatusView(status: AfkStatusResponse): AfkStatusView {
  if ("active" in status) return { active: false, message: "" };

  const end = Date.parse(status.scheduledEndAt);
  const hours = Number.isFinite(end)
    ? Math.max(0, Math.round(((end - Date.now()) / 3_600_000) * 10) / 10)
    : null;
  const suffix = hours === null ? "" : hours > 0 ? ` · 约余 ${hours} 时辰` : " · 正待结算";
  return {
    active: status.status === "running" || status.status === "paused",
    message: status.kind === "study" ? `静心参悟${suffix}` : `行侠途中${suffix}`,
    ...(status.stopReason ? { reason: status.stopReason } : {}),
  };
}
