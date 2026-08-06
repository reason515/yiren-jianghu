/** 任务与主线面板数据（由 GET /quests 组装；服务端权威）。 */

export type QuestKind = "sect" | "bounty" | "main";
export type QuestPhaseType = "goto" | "kill" | "talk" | "deliver" | "collect";

export interface QuestPhaseView {
  type: QuestPhaseType;
  label: string;
  done: boolean;
  progress?: { cur: number; need: number };
}

export interface QuestRewardView {
  exp: number;
  potential: number;
  silver: number;
}

export interface QuestView {
  id: string;
  name: string;
  kind: QuestKind;
  briefing: string;
  phases: QuestPhaseView[];
  rewards: QuestRewardView;
  state: "available" | "accepted" | "completed";
}

export interface StoryNodeView {
  id: string;
  title: string;
  current: boolean;
  done: boolean;
}

export interface QuestPanelData {
  quests: QuestView[];
  story: StoryNodeView[];
}

export const PHASE_LABEL: Record<QuestPhaseType, string> = {
  goto: "前往",
  kill: "击杀",
  talk: "交谈",
  deliver: "送交",
  collect: "收集",
};

export const KIND_LABEL: Record<QuestKind, string> = {
  sect: "师门",
  bounty: "悬赏",
  main: "主线",
};
