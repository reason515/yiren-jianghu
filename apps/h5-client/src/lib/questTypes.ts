/** 任务与主线面板数据：由 GET /quests 服务端组装，客户端仅筛选与展示。 */

export type QuestKind = "sect" | "bounty" | "main";
export type QuestPhaseType = "goto" | "kill" | "talk" | "deliver" | "collect";

export interface QuestPhaseView {
  type: QuestPhaseType;
  /** 服务端以内容包解析出的目标名；不得向玩家泄露内部 id。 */
  targetName: string;
  /** 目标所在房间；goto 相位用它发起导航指向。 */
  targetRoomId?: string;
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
  autoUnlocked?: boolean;
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
  rumors: Array<{ id: string; text: string }>;
}

interface ApiQuestPhase {
  type: QuestPhaseType;
  targetName: string;
  targetRoomId?: string;
  count: number;
  done: number;
}

interface ApiQuest {
  id: string;
  name: string;
  kind: QuestKind;
  briefing: string;
  status: "locked" | "available" | "ongoing" | "reportable" | "completed";
  phases: ApiQuestPhase[];
  rewards: QuestRewardView;
  autoUnlocked?: boolean;
}

export interface QuestOverviewResponse {
  quests: ApiQuest[];
  story: StoryNodeView[];
  rumors?: Array<{ id: string; text: string; tags?: string[] }>;
}

function panelState(status: ApiQuest["status"]): QuestView["state"] | null {
  switch (status) {
    case "available":
      return "available";
    case "ongoing":
    case "reportable":
      return "accepted";
    case "completed":
      return "completed";
    case "locked":
      return null;
  }
}

/** 将服务端任务状态转换为玩家面板：锁定任务不占用“手头之事”。 */
export function toQuestPanelData(response: QuestOverviewResponse): QuestPanelData {
  return {
    story: response.story,
    rumors: (response.rumors ?? []).map((r) => ({ id: r.id, text: r.text })),
    quests: response.quests.flatMap((quest) => {
      const state = panelState(quest.status);
      if (!state) return [];
      return [
        {
          id: quest.id,
          name: quest.name,
          kind: quest.kind,
          briefing: quest.briefing,
          phases: quest.phases.map((phase) => ({
            type: phase.type,
            targetName: phase.targetName,
            ...(phase.targetRoomId ? { targetRoomId: phase.targetRoomId } : {}),
            done: phase.done >= phase.count,
            ...(phase.type === "goto" || phase.type === "talk"
              ? {}
              : { progress: { cur: phase.done, need: phase.count } }),
          })),
          rewards: quest.rewards,
          state,
          autoUnlocked: Boolean(quest.autoUnlocked),
        },
      ];
    }),
  };
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
