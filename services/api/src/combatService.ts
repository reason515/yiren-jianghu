import {
  advanceBattleRound,
  canUsePerform,
  createBattleState,
  createSeededRng,
  performToBattleAction,
  rollDrops,
  type BattleAction,
  type BattleContext,
  type BattleEvent,
  type BattleState,
  type PerformCooldownTracker,
} from "@yjh/game-core";
import type { ContentPack, Perform } from "@yjh/content";
import type { Json } from "@yjh/shared";
import { buildCharacterCombatant, buildNpcCombatant } from "./combatantFactory.js";
import type { Db } from "./db.js";
import type { QuestsService } from "./questsService.js";

export class CombatError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CombatError";
  }
}

export interface CombatStatusView {
  id: string;
  targetId: string;
  status: "ongoing" | "finished" | "abandoned";
  seed: number;
  state: BattleState;
  events: BattleEvent[];
  /** 当前角色已习得绝招的服务端可用态；客户端仅作展示提示，action 仍会复核。 */
  performs: Array<{ id: string; name: string; ready: boolean }>;
}

/** 路由层只传受控意图；绝招效果、消耗与冷却始终由服务端按内容包解析。 */
export interface CombatActionInput {
  action: string;
  performId?: string;
}

export interface CombatService {
  start(accountId: string, targetId: string): Promise<CombatStatusView>;
  status(accountId: string): Promise<CombatStatusView | null>;
  action(accountId: string, input: CombatActionInput): Promise<CombatStatusView>;
}

type CharacterRow = {
  id: string;
  name: string;
  attrs: { str: number; int: number; con: number; dex: number };
  exp: number;
  qi: number;
  jing: number;
  neili: number;
  room_path: string;
};

type SessionRow = {
  id: string;
  target_def_id: string;
  status: "ongoing" | "finished" | "abandoned";
  seed: number;
  state: string | BattleState;
};

function decodeState(state: string | BattleState): BattleState {
  const parsed = (typeof state === "string" ? JSON.parse(state) : state) as BattleState;
  // 兼容 F0 状态列上线前创建的会话；新会话一律显式持久化冷却表。
  return { ...parsed, performCooldowns: parsed.performCooldowns ?? {} };
}

function actionError(check: ReturnType<typeof canUsePerform>): CombatError {
  switch (check.reason) {
    case "cooldown":
      return new CombatError("perform_cooling_down", "余势未歇，暂不可再使此式");
    case "cost":
      return new CombatError("perform_cost", "真气未复，此式难发");
    case "buff_unsupported":
      return new CombatError("perform_unsupported", "此式变化未成，暂难施展");
    case "condition":
      return new CombatError("perform_condition", "此刻气机未合，难以施展");
    default:
      return new CombatError("perform_unavailable", "此式暂不可用");
  }
}

export function createCombatService(
  db: Db,
  content: ContentPack,
  quests?: Pick<QuestsService, "recordProgress">,
): CombatService {
  const activeCharacter = async (accountId: string): Promise<CharacterRow | null> => {
    const rows = await db.query<CharacterRow>(
      "SELECT id, name, attrs, exp, qi, jing, neili, room_path FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    const row = rows.rows[0];
    if (!row) return null;
    return { ...row, attrs: row.attrs ?? { str: 10, int: 10, con: 10, dex: 10 } };
  };

  const skillsOf = async (characterId: string): Promise<Map<string, number>> => {
    const rows = await db.query<{ skill_id: string; level: number }>(
      "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
      [characterId],
    );
    return new Map(rows.rows.map((row) => [row.skill_id, row.level]));
  };

  const toView = async (
    row: SessionRow,
    skillLevels: Map<string, number>,
  ): Promise<CombatStatusView> => {
    const battleState = decodeState(row.state);
    const turn = battleState.turn + 1;
    const battle: BattleContext = {
      turn,
      get(actor) {
        const combatant = battleState.combatants[actor];
        return {
          qi: combatant.qi,
          maxQi: combatant.maxQi,
          jing: combatant.jing,
          maxJing: combatant.maxJing,
          neili: combatant.neili,
          maxNeili: combatant.maxNeili,
          stats: combatant.stats,
        };
      },
    };
    const cooldown: PerformCooldownTracker = {
      canUse(candidate: Perform, atTurn: number) {
        const lastUsed = battleState.performCooldowns[candidate.id];
        return lastUsed === undefined || atTurn - lastUsed >= candidate.cooldownTurns;
      },
      markUsed() {},
    };
    const performs = content.performs
      .filter((perform) => (skillLevels.get(perform.skillId) ?? 0) > 0)
      .map((perform) => ({
        id: perform.id,
        name: perform.name,
        ready:
          performToBattleAction(perform) !== null &&
          canUsePerform(
            perform,
            { battle, actor: "a", skillLevel: skillLevels.get(perform.skillId)! },
            turn,
            cooldown,
          ).ok,
      }));
    const eventRows = await db.query<{
      seq: number;
      type: string;
      payload: unknown;
    }>("SELECT seq, type, payload FROM combat_events WHERE session_id = $1 ORDER BY seq ASC", [
      row.id,
    ]);
    return {
      id: row.id,
      targetId: row.target_def_id,
      status: row.status,
      seed: row.seed,
      state: battleState,
      performs,
      events: eventRows.rows.map((event) => {
        const payload =
          typeof event.payload === "string"
            ? (JSON.parse(event.payload) as {
                actor?: BattleEvent["actor"];
                data?: BattleEvent["data"];
              })
            : (event.payload as { actor?: BattleEvent["actor"]; data?: BattleEvent["data"] });
        // 兼容首个 battle_start 与历史裸 payload；新事件把 actor 与 data 一并封装。
        return {
          seq: event.seq,
          type: event.type,
          ...(payload.actor !== undefined ? { actor: payload.actor } : {}),
          data: payload.data ?? (payload as BattleEvent["data"]),
        };
      }),
    };
  };

  const resolvePlayerAction = (
    input: CombatActionInput,
    state: BattleState,
    skillLevels: Map<string, number>,
  ): { action: BattleAction; usedPerformId?: string } => {
    if (input.action === "attack" || input.action === "recover" || input.action === "flee") {
      return { action: { type: input.action } };
    }
    if (input.action !== "perform") {
      throw new CombatError("invalid_action", "这一式尚未练成");
    }
    if (!input.performId) throw new CombatError("perform_required", "须择一门绝招");

    const perform = content.performs.find((entry) => entry.id === input.performId);
    if (!perform) throw new CombatError("perform_not_found", "此式未在江湖谱中");
    const skillLevel = skillLevels.get(perform.skillId) ?? 0;
    if (skillLevel <= 0) throw new CombatError("perform_not_learned", "此式尚未参悟");

    const turn = state.turn + 1;
    const battle: BattleContext = {
      turn,
      get(actor) {
        const combatant = state.combatants[actor];
        return {
          qi: combatant.qi,
          maxQi: combatant.maxQi,
          jing: combatant.jing,
          maxJing: combatant.maxJing,
          neili: combatant.neili,
          maxNeili: combatant.maxNeili,
          stats: combatant.stats,
        };
      },
    };
    const cooldown: PerformCooldownTracker = {
      canUse(candidate: Perform, atTurn: number) {
        const lastUsed = state.performCooldowns[candidate.id];
        return lastUsed === undefined || atTurn - lastUsed >= candidate.cooldownTurns;
      },
      markUsed() {},
    };
    const check = canUsePerform(perform, { battle, actor: "a", skillLevel }, turn, cooldown);
    if (!check.ok) throw actionError(check);
    const action = performToBattleAction(perform);
    if (!action) throw new CombatError("perform_unsupported", "此式变化未成，暂难施展");
    return { action, usedPerformId: perform.id };
  };

  return {
    async start(accountId, targetId) {
      const character = await activeCharacter(accountId);
      if (!character) throw new CombatError("no_character", "尚未立名闯江湖");
      const room = content.rooms.find((entry) => entry.id === character.room_path);
      if (!room) throw new CombatError("room_not_found", "此地的路数已乱，暂不可交手");
      if (!room.npcIds.includes(targetId)) throw new CombatError("target_not_here", "此人不在眼前");
      const target = content.npcs.find((npc) => npc.id === targetId);
      if (!target || target.kind !== "battle") {
        throw new CombatError("target_not_battle", "此人无意交锋");
      }

      const existing = await db.query<{ id: string }>(
        "SELECT id FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing'",
        [character.id],
      );
      if (existing.rows[0]) throw new CombatError("combat_in_progress", "胜负未分，不可另起争端");

      const skillLevels = await skillsOf(character.id);
      const state = createBattleState(
        buildCharacterCombatant(content, character, skillLevels, "current"),
        buildNpcCombatant(content, target),
      );
      const seed = Math.floor(Math.random() * 0x7fffffff);
      const inserted = await db.query<SessionRow>(
        "INSERT INTO combat_sessions (character_id, kind, status, target_def_id, seed, state) VALUES ($1, 'pve', 'ongoing', $2, $3, $4) RETURNING id, target_def_id, status, seed, state",
        [character.id, target.id, seed, JSON.stringify(state)],
      );
      const session = inserted.rows[0]!;
      await db.query(
        "INSERT INTO combat_events (session_id, seq, type, payload) VALUES ($1, 0, 'battle_start', $2)",
        [session.id, JSON.stringify({ seed })],
      );
      return toView(session, skillLevels);
    },

    async action(accountId, input) {
      // Pool 注入时以行锁串行化同一场战斗，避免双击/重试重复结算战利与任务进度。
      if (db.transaction) {
        return db.transaction((tx) =>
          createCombatService(tx, content, quests).action(accountId, input),
        );
      }
      const character = await activeCharacter(accountId);
      if (!character) throw new CombatError("no_character", "尚未立名闯江湖");
      const rows = await db.query<SessionRow>(
        "SELECT id, target_def_id, status, seed, state FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing' ORDER BY started_at DESC LIMIT 1 FOR UPDATE",
        [character.id],
      );
      const session = rows.rows[0];
      if (!session) throw new CombatError("combat_not_found", "眼前并无未了的争斗");
      const state = decodeState(session.state);
      const skillLevels = await skillsOf(character.id);
      const { action: playerAction, usedPerformId } = resolvePlayerAction(
        input,
        state,
        skillLevels,
      );
      const round = advanceBattleRound(state, {
        seed: session.seed,
        params: content.params,
        playerAction,
        opponentAction: { type: "attack" },
      });
      const finished = round.state.winner !== undefined;
      const result =
        round.state.fled === "a"
          ? "escape"
          : round.state.winner === "a"
            ? "win"
            : round.state.winner === "b"
              ? "lose"
              : null;
      const nextState: BattleState = {
        ...round.state,
        performCooldowns: usedPerformId
          ? { ...round.state.performCooldowns, [usedPerformId]: state.turn + 1 }
          : round.state.performCooldowns,
      };
      const events = [...round.events];

      if (result === "win") {
        const target = content.npcs.find((npc) => npc.id === session.target_def_id)!;
        const rng = createSeededRng(session.seed);
        for (let i = 0; i < nextState.rngCalls; i += 1) rng();
        const drops = rollDrops(rng, target.drops, character.exp);
        const dropsForEvent: Json[] = drops.map((drop) => ({
          itemId: drop.itemId,
          count: drop.count,
        }));
        const rewards = target.battleRewards;
        events.push({
          seq: nextState.nextSeq,
          type: "reward",
          actor: "a",
          data: {
            exp: rewards.exp,
            potential: rewards.potential,
            silver: rewards.silver,
            drops: dropsForEvent,
          },
        });
        nextState.nextSeq += 1;
        const progress = await quests?.recordProgress(accountId, "kill", target.id);
        if (progress) {
          events.push({
            seq: nextState.nextSeq,
            type: "quest_progress",
            actor: "a",
            data: progress,
          });
          nextState.nextSeq += 1;
        }
        await db.query(
          "UPDATE characters SET qi = $1, jing = $2, neili = $3, exp = exp + $4, potential = potential + $5, silver = silver + $6 WHERE id = $7",
          [
            nextState.combatants.a.qi,
            nextState.combatants.a.jing,
            nextState.combatants.a.neili,
            rewards.exp,
            rewards.potential,
            rewards.silver,
            character.id,
          ],
        );
        for (const drop of drops) {
          await db.query(
            "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, $3)",
            [character.id, drop.itemId, drop.count],
          );
        }
      } else {
        await db.query("UPDATE characters SET qi = $1, jing = $2, neili = $3 WHERE id = $4", [
          nextState.combatants.a.qi,
          nextState.combatants.a.jing,
          nextState.combatants.a.neili,
          character.id,
        ]);
      }

      await db.query(
        "UPDATE combat_sessions SET state = $1, status = $2, result = $3, finished_at = CASE WHEN $2 = 'finished' THEN now() ELSE NULL END WHERE id = $4",
        [JSON.stringify(nextState), finished ? "finished" : "ongoing", result, session.id],
      );
      for (const event of events) {
        await db.query(
          "INSERT INTO combat_events (session_id, seq, type, payload) VALUES ($1, $2, $3, $4)",
          [
            session.id,
            event.seq,
            event.type,
            JSON.stringify({ actor: event.actor, data: event.data }),
          ],
        );
      }
      return toView(
        { ...session, status: finished ? "finished" : "ongoing", state: nextState },
        skillLevels,
      );
    },

    async status(accountId) {
      const character = await activeCharacter(accountId);
      if (!character) throw new CombatError("no_character", "尚未立名闯江湖");
      const rows = await db.query<SessionRow>(
        "SELECT id, target_def_id, status, seed, state FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing' ORDER BY started_at DESC LIMIT 1",
        [character.id],
      );
      const row = rows.rows[0];
      return row ? toView(row, await skillsOf(character.id)) : null;
    },
  };
}
