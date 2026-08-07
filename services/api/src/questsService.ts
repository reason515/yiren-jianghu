import type { ContentPack, Quest } from "@yjh/content";
import type { Db } from "./db.js";

/** 任务域错误（code 进入错误信封）。 */
export class QuestsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "QuestsError";
  }
}

export type QuestStatus = "locked" | "available" | "ongoing" | "reportable" | "completed";

export interface QuestPhaseView {
  type: "goto" | "kill" | "talk" | "deliver" | "collect";
  targetId: string;
  /** 内容包解析后的玩家可见目标名，客户端不展示内部 id。 */
  targetName: string;
  /** 目标所在房间；goto 相位即为目标房间本身，供客户端给出导航指向。 */
  targetRoomId?: string;
  count: number;
  done: number;
}

export interface QuestView {
  id: string;
  name: string;
  kind: string;
  minExp: number;
  briefing: string;
  status: QuestStatus;
  phases: QuestPhaseView[];
  rewards: {
    exp: number;
    potential: number;
    silver: number;
    items: Array<{ itemId: string; count: number }>;
  };
  repeatable: boolean;
}

type QuestRecord = {
  quest_id: string;
  status: "accepted" | "completed" | "reported";
  progress: { phase: number; counts: Record<string, number> };
};

export interface QuestStoryNodeView {
  id: string;
  title: string;
  done: boolean;
  current: boolean;
}

export interface QuestOverview {
  quests: QuestView[];
  story: QuestStoryNodeView[];
}

export interface QuestsService {
  getQuests(accountId: string): Promise<QuestView[] | null>;
  getOverview(accountId: string): Promise<QuestOverview | null>;
  acceptQuest(accountId: string, questId: string): Promise<QuestView>;
  reportQuest(
    accountId: string,
    questId: string,
  ): Promise<{
    rewards: QuestView["rewards"];
    character: { exp: number; potential: number; silver: number };
  }>;
  /**
   * 进度钩子：供战斗/挂机等域在击杀/交谈/抵达等时机推进任务（本域实现并单测，暂不开放路由）。
   * 返回被推进的任务与是否完成；无匹配返回 null。
   */
  recordProgress(
    accountId: string,
    type: "goto" | "kill" | "talk" | "deliver" | "collect",
    targetId: string,
  ): Promise<{ questId: string; questName: string; phase: number; completed: boolean } | null>;
}

type CharacterRow = {
  id: string;
  exp: number;
  potential: number;
  silver: number;
};

const DEFAULT_PROGRESS = (): QuestRecord["progress"] => ({ phase: 0, counts: {} });

function phaseDone(phase: Quest["phases"][number], counts: Record<string, number>): boolean {
  const have = counts[phase.targetId] ?? 0;
  return phase.type === "talk" || phase.type === "goto" ? have >= 1 : have >= (phase.count ?? 1);
}

function allPhasesDone(quest: Quest, progress: QuestRecord["progress"]): boolean {
  return progress.phase >= quest.phases.length;
}

export function createQuestsService(db: Db, content: ContentPack): QuestsService {
  const questsById = new Map(content.quests.map((q) => [q.id, q]));

  const activeCharacter = async (accountId: string): Promise<CharacterRow | null> => {
    const rows = await db.query<CharacterRow>(
      "SELECT id, exp, potential, silver FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const recordsOf = async (characterId: string): Promise<Map<string, QuestRecord>> => {
    const rows = await db.query<QuestRecord>(
      "SELECT quest_id, status, progress FROM character_quests WHERE character_id = $1",
      [characterId],
    );
    return new Map(rows.rows.map((r) => [r.quest_id, r]));
  };

  const targetMeta = (targetId: string): { targetName: string; targetRoomId?: string } => {
    const room = content.rooms.find((entry) => entry.id === targetId);
    if (room) return { targetName: room.name, targetRoomId: room.id };
    const npc = content.npcs.find((entry) => entry.id === targetId);
    if (npc) {
      return {
        targetName: npc.name,
        targetRoomId: content.rooms.find((roomEntry) => roomEntry.npcIds.includes(targetId))?.id,
      };
    }
    const item = content.items.find((entry) => entry.id === targetId);
    if (item) {
      return {
        targetName: item.name,
        targetRoomId: content.rooms.find((roomEntry) => roomEntry.itemIds.includes(targetId))?.id,
      };
    }
    return { targetName: targetId };
  };

  const view = (quest: Quest, exp: number, record?: QuestRecord): QuestView => {
    let status: QuestStatus;
    if (!record) {
      status = quest.minExp <= exp ? "available" : "locked";
    } else if (record.status === "reported") {
      status = quest.repeatable ? "available" : "completed";
    } else if (record.status === "completed" || allPhasesDone(quest, record.progress)) {
      status = "reportable";
    } else {
      status = "ongoing";
    }
    const progress = record?.progress ?? DEFAULT_PROGRESS();
    return {
      id: quest.id,
      name: quest.name,
      kind: quest.kind,
      minExp: quest.minExp,
      briefing: quest.briefing,
      status,
      phases: quest.phases.map((p) => ({
        type: p.type,
        targetId: p.targetId,
        ...targetMeta(p.targetId),
        count:
          p.type === "kill" || p.type === "deliver" || p.type === "collect"
            ? "count" in p
              ? p.count
              : 1
            : 1,
        done: Math.min(progress.counts[p.targetId] ?? 0, "count" in p ? p.count : 1),
      })),
      rewards: quest.rewards,
      repeatable: quest.repeatable,
    };
  };

  return {
    async getQuests(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const records = await recordsOf(ch.id);
      return content.quests.map((q) => view(q, ch.exp, records.get(q.id)));
    },

    async getOverview(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const records = await recordsOf(ch.id);
      const quests = content.quests.map((quest) => view(quest, ch.exp, records.get(quest.id)));
      let hasCurrent = false;
      const story = content.story.map((node) => {
        // 主线足迹只读取任务记录，不因可重复任务回到 available 而抹去已走过的节点。
        const done = node.questId ? records.get(node.questId)?.status === "reported" : false;
        const current = !done && !hasCurrent;
        if (current) hasCurrent = true;
        return { id: node.id, title: node.title, done, current };
      });
      return { quests, story };
    },

    async acceptQuest(accountId, questId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new QuestsError("no_character", "尚未立名闯江湖");
      const quest = questsById.get(questId);
      if (!quest) throw new QuestsError("quest_not_found", "江湖上没这桩事（内容包未收录）");
      if (quest.minExp > ch.exp) throw new QuestsError("min_exp", "阅历尚浅，还接不下这桩事");

      const records = await recordsOf(ch.id);
      const existing = records.get(questId);
      if (existing?.status === "accepted" || existing?.status === "completed") {
        throw new QuestsError("already_accepted", "这桩事你已应下，尚未了结");
      }
      if (existing?.status === "reported" && !quest.repeatable) {
        throw new QuestsError("already_completed", "这桩事早已了结");
      }

      const progress = DEFAULT_PROGRESS();
      if (existing) {
        await db.query(
          "UPDATE character_quests SET status = 'accepted', progress = $1, accepted_at = now(), completed_at = NULL, reported_at = NULL WHERE character_id = $2 AND quest_id = $3",
          [JSON.stringify(progress), ch.id, questId],
        );
      } else {
        await db.query(
          "INSERT INTO character_quests (character_id, quest_id, status, progress) VALUES ($1, $2, 'accepted', $3)",
          [ch.id, questId, JSON.stringify(progress)],
        );
      }
      return view(quest, ch.exp, {
        quest_id: questId,
        status: "accepted",
        progress,
      });
    },

    async reportQuest(accountId, questId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new QuestsError("no_character", "尚未立名闯江湖");
      const quest = questsById.get(questId);
      if (!quest) throw new QuestsError("quest_not_found", "江湖上没这桩事（内容包未收录）");

      const records = await recordsOf(ch.id);
      const record = records.get(questId);
      if (!record || record.status === "reported") {
        throw new QuestsError("not_accepted", "你尚未接下这桩事");
      }
      if (!allPhasesDone(quest, record.progress)) {
        throw new QuestsError("not_complete", "事未办妥，还交不了差");
      }

      const rewards = quest.rewards;
      await db.query(
        "UPDATE characters SET exp = exp + $1, potential = potential + $2, silver = silver + $3 WHERE id = $4",
        [rewards.exp, rewards.potential, rewards.silver, ch.id],
      );
      await db.query(
        "UPDATE character_quests SET status = 'reported', reported_at = now() WHERE character_id = $1 AND quest_id = $2",
        [ch.id, questId],
      );

      const after = await activeCharacter(accountId);
      return {
        rewards,
        character: {
          exp: after?.exp ?? ch.exp,
          potential: after?.potential ?? ch.potential,
          silver: after?.silver ?? ch.silver,
        },
      };
    },

    async recordProgress(accountId, type, targetId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new QuestsError("no_character", "尚未立名闯江湖");
      const records = await recordsOf(ch.id);

      for (const quest of content.quests) {
        const record = records.get(quest.id);
        if (!record || record.status !== "accepted") continue;
        if (record.progress.phase >= quest.phases.length) continue;
        const phase = quest.phases[record.progress.phase];
        if (!phase) continue;
        if (phase.type !== type || phase.targetId !== targetId) continue;

        const counts = { ...record.progress.counts };
        counts[targetId] = (counts[targetId] ?? 0) + 1;
        const done = phaseDone(phase, counts);
        let nextPhase = record.progress.phase;
        if (done) nextPhase += 1;
        const completed = nextPhase >= quest.phases.length;
        const nextProgress = { phase: nextPhase, counts };

        if (completed) {
          await db.query(
            "UPDATE character_quests SET progress = $1, status = 'completed', completed_at = now() WHERE character_id = $2 AND quest_id = $3",
            [JSON.stringify(nextProgress), ch.id, quest.id],
          );
        } else {
          await db.query(
            "UPDATE character_quests SET progress = $1 WHERE character_id = $2 AND quest_id = $3",
            [JSON.stringify(nextProgress), ch.id, quest.id],
          );
        }
        return { questId: quest.id, questName: quest.name, phase: nextPhase, completed };
      }
      return null;
    },
  };
}
