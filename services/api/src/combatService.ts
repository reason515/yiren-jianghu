import {
  advanceBattleRound,
  canUsePerform,
  createBattleState,
  createSeededRng,
  MAX_COMBAT_FOES,
  normalizeBattleState,
  performToBattleAction,
  pickMove,
  PLAYER_ACTOR,
  rollDrops,
  type BattleAction,
  type BattleContext,
  type BattleEvent,
  type BattleState,
  type CombatStats,
  type MoveInfo,
  type PerformCooldownTracker,
  type SkillEnableMap,
} from "@yjh/game-core";
import type { ContentPack, Move, Npc, Perform } from "@yjh/content";
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

/** 全零占位战力（无战斗体时的兜底视图，避免可选链散落各处）。 */
export const EMPTY_COMBAT_STATS: CombatStats = {
  attack: 0,
  defense: 0,
  dodge: 0,
  parry: 0,
  weaponLevel: 0,
  forceLevel: 0,
  attackSkillLevel: 0,
  dodgeSkillLevel: 0,
  parrySkillLevel: 0,
  combatExp: 0,
  str: 0,
  dex: 0,
  con: 0,
};

export interface CombatStatusView {
  id: string;
  targetId: string;
  /** 本场全部敌方内容包 NPC id（有序）。 */
  targetIds: string[];
  status: "ongoing" | "finished" | "abandoned";
  seed: number;
  state: BattleState;
  events: BattleEvent[];
  /** 当前角色已学绝招（character_performs）的服务端可用态；客户端仅作展示提示，action 仍会复核。 */
  performs: Array<{ id: string; name: string; ready: boolean }>;
}

/** 路由层只传受控意图；绝招效果、消耗与冷却始终由服务端按内容包解析。 */
export interface CombatActionInput {
  action: string;
  performId?: string;
  /** 敌方槽位键（如 b0）；缺省自动选气最低者。 */
  targetId?: string;
}

export interface CombatService {
  /** @param targetIds 主目标在前；服务端会并入同房 battleAllies。 */
  start(accountId: string, targetIds: string[]): Promise<CombatStatusView>;
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
  skill_enable: SkillEnableMap | string | null;
};

type SessionRow = {
  id: string;
  target_def_id: string;
  status: "ongoing" | "finished" | "abandoned";
  seed: number;
  state: string | BattleState;
};

/** 角色本场战斗所需的技能/激发/招式上下文（DC-041）；start/action/status 共用一份加载逻辑。 */
interface CombatContext {
  skillLevels: Map<string, number>;
  enableMap: SkillEnableMap;
  hasWeapon: boolean;
  learnedMoveIds: Set<string>;
  learnedPerformIds: Set<string>;
}

function decodeState(state: string | BattleState): BattleState {
  const parsed = (typeof state === "string" ? JSON.parse(state) : state) as BattleState;
  return normalizeBattleState({
    ...parsed,
    performCooldowns: parsed.performCooldowns ?? {},
  });
}

function decodeEnableMap(raw: SkillEnableMap | string | null): SkillEnableMap {
  if (!raw) return {};
  return typeof raw === "string" ? (JSON.parse(raw) as SkillEnableMap) : raw;
}

function toMoveInfo(move: Move): MoveInfo {
  return {
    id: move.id,
    name: move.name,
    damage: move.damage,
    force: move.force,
    dodge: move.dodge,
  };
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

/** 主目标 + 同房有效盟友，去重且不超过上限。 */
export function resolveEncounterTargets(
  content: ContentPack,
  roomNpcIds: string[],
  primaryIds: string[],
): Npc[] {
  const roomSet = new Set(roomNpcIds);
  const ordered: string[] = [];
  const push = (id: string): void => {
    if (!roomSet.has(id) || ordered.includes(id)) return;
    if (ordered.length >= MAX_COMBAT_FOES) return;
    ordered.push(id);
  };
  for (const id of primaryIds) push(id);
  for (const id of [...primaryIds]) {
    const npc = content.npcs.find((entry) => entry.id === id);
    if (!npc) continue;
    for (const allyId of npc.battleAllies ?? []) push(allyId);
  }
  const npcs: Npc[] = [];
  for (const id of ordered) {
    const npc = content.npcs.find((entry) => entry.id === id);
    if (!npc || npc.kind !== "battle") {
      throw new CombatError("target_not_battle", "此人无意交锋");
    }
    npcs.push(npc);
  }
  if (npcs.length === 0) throw new CombatError("target_not_here", "此人不在眼前");
  return npcs;
}

function targetIdsOf(state: BattleState, fallback: string): string[] {
  const slots = state.foeIds ?? [];
  if (state.foeNpcIds && slots.length > 0) {
    return slots.map((slot) => state.foeNpcIds![slot] ?? fallback).filter(Boolean);
  }
  return [fallback];
}

export function createCombatService(
  db: Db,
  content: ContentPack,
  quests?: Pick<QuestsService, "recordProgress">,
): CombatService {
  const activeCharacter = async (accountId: string): Promise<CharacterRow | null> => {
    const rows = await db.query<CharacterRow>(
      "SELECT id, name, attrs, exp, qi, jing, neili, room_path, skill_enable FROM characters WHERE account_id = $1 AND status = 'active'",
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

  const hasEquippedWeapon = async (characterId: string): Promise<boolean> => {
    const rows = await db.query<{ id: string }>(
      "SELECT id FROM character_items WHERE character_id = $1 AND slot = 'weapon' LIMIT 1",
      [characterId],
    );
    return rows.rows.length > 0;
  };

  const learnedMoveIdsOf = async (characterId: string): Promise<Set<string>> => {
    const rows = await db.query<{ move_id: string }>(
      "SELECT move_id FROM character_moves WHERE character_id = $1",
      [characterId],
    );
    return new Set(rows.rows.map((row) => row.move_id));
  };

  const learnedPerformIdsOf = async (characterId: string): Promise<Set<string>> => {
    const rows = await db.query<{ perform_id: string }>(
      "SELECT perform_id FROM character_performs WHERE character_id = $1",
      [characterId],
    );
    return new Set(rows.rows.map((row) => row.perform_id));
  };

  const contextOf = async (character: CharacterRow): Promise<CombatContext> => {
    const [skillLevels, hasWeapon, learnedMoveIds, learnedPerformIds] = await Promise.all([
      skillsOf(character.id),
      hasEquippedWeapon(character.id),
      learnedMoveIdsOf(character.id),
      learnedPerformIdsOf(character.id),
    ]);
    return {
      skillLevels,
      enableMap: decodeEnableMap(character.skill_enable),
      hasWeapon,
      learnedMoveIds,
      learnedPerformIds,
    };
  };

  const toView = async (row: SessionRow, ctx: CombatContext): Promise<CombatStatusView> => {
    const battleState = decodeState(row.state);
    const turn = battleState.turn + 1;
    const battle: BattleContext = {
      turn,
      get(actor) {
        const combatant = battleState.combatants[actor];
        if (!combatant) {
          return {
            qi: 0,
            maxQi: 0,
            jing: 0,
            maxJing: 0,
            neili: 0,
            maxNeili: 0,
            stats: EMPTY_COMBAT_STATS,
          };
        }
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
    // DC-041：绝招须已学（character_performs），不再以技能等级 > 0 作为可用依据。
    const performs = content.performs
      .filter((perform) => ctx.learnedPerformIds.has(perform.id))
      .map((perform) => {
        const skillLevel = ctx.skillLevels.get(perform.skillId) ?? 0;
        return {
          id: perform.id,
          name: perform.name,
          ready:
            performToBattleAction(perform, skillLevel) !== null &&
            canUsePerform(perform, { battle, actor: "a", skillLevel }, turn, cooldown).ok,
        };
      });
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
      targetIds: targetIdsOf(battleState, row.target_def_id),
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
        return {
          seq: event.seq,
          type: event.type,
          ...(payload.actor !== undefined ? { actor: payload.actor } : {}),
          data: payload.data ?? (payload as BattleEvent["data"]),
        };
      }),
    };
  };

  /** 玩家「攻击」时按 DC-041 从已解锁 + 已激发的招式中抽一式；无可用招式落回纯基础攻击。 */
  const resolveAttackAction = (
    state: BattleState,
    ctx: CombatContext,
    seed: number,
  ): { action: BattleAction; rngCallsUsed: number } => {
    const enabledSpecialIds = Object.values(ctx.enableMap).filter((id): id is string =>
      Boolean(id),
    );
    const base = createSeededRng(seed);
    for (let i = 0; i < state.rngCalls; i += 1) base();
    let rngCallsUsed = 0;
    const countingRng = (): number => {
      rngCallsUsed += 1;
      return base();
    };
    const move = pickMove({
      moves: content.moves,
      learnedMoveIds: ctx.learnedMoveIds,
      enabledSpecialIds,
      rng: countingRng,
    });
    return {
      action: { type: "attack", ...(move ? { move: toMoveInfo(move) } : {}) },
      rngCallsUsed,
    };
  };

  const resolvePlayerAction = (
    input: CombatActionInput,
    state: BattleState,
    ctx: CombatContext,
    seed: number,
  ): { action: BattleAction; usedPerformId?: string; rngCallsUsed: number } => {
    if (input.action === "attack") {
      return resolveAttackAction(state, ctx, seed);
    }
    if (input.action === "recover" || input.action === "flee") {
      return { action: { type: input.action }, rngCallsUsed: 0 };
    }
    if (input.action !== "perform") {
      throw new CombatError("invalid_action", "这一式尚未练成");
    }
    if (!input.performId) throw new CombatError("perform_required", "须择一门绝招");

    const perform = content.performs.find((entry) => entry.id === input.performId);
    if (!perform) throw new CombatError("perform_not_found", "此式未在江湖谱中");
    // DC-041：绝招须已在 character_performs 学会，技能等级仅用于效果放大。
    if (!ctx.learnedPerformIds.has(perform.id)) {
      throw new CombatError("perform_not_learned", "此式尚未参悟");
    }
    const skillLevel = ctx.skillLevels.get(perform.skillId) ?? 0;

    const turn = state.turn + 1;
    const battle: BattleContext = {
      turn,
      get(actor) {
        const combatant = state.combatants[actor];
        if (!combatant) {
          return {
            qi: 0,
            maxQi: 0,
            jing: 0,
            maxJing: 0,
            neili: 0,
            maxNeili: 0,
            stats: EMPTY_COMBAT_STATS,
          };
        }
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
    const action = performToBattleAction(perform, skillLevel);
    if (!action) throw new CombatError("perform_unsupported", "此式变化未成，暂难施展");
    return { action, usedPerformId: perform.id, rngCallsUsed: 0 };
  };

  return {
    async start(accountId, targetIds) {
      const character = await activeCharacter(accountId);
      if (!character) throw new CombatError("no_character", "尚未立名闯江湖");
      const room = content.rooms.find((entry) => entry.id === character.room_path);
      if (!room) throw new CombatError("room_not_found", "此地的路数已乱，暂不可交手");
      if (!targetIds.length) throw new CombatError("target_not_here", "此人不在眼前");
      for (const id of targetIds) {
        if (!room.npcIds.includes(id)) throw new CombatError("target_not_here", "此人不在眼前");
      }

      const existing = await db.query<{ id: string }>(
        "SELECT id FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing'",
        [character.id],
      );
      if (existing.rows[0]) throw new CombatError("combat_in_progress", "胜负未分，不可另起争端");

      const encounter = resolveEncounterTargets(content, room.npcIds, targetIds);
      const ctx = await contextOf(character);
      const state = createBattleState(
        buildCharacterCombatant(
          content,
          character,
          ctx.skillLevels,
          "current",
          ctx.enableMap,
          ctx.hasWeapon,
        ),
        encounter.map((npc) => buildNpcCombatant(content, npc)),
      );
      state.foeNpcIds = Object.fromEntries(
        (state.foeIds ?? []).map((slot, index) => [slot, encounter[index]!.id]),
      );
      const seed = Math.floor(Math.random() * 0x7fffffff);
      const primary = encounter[0]!;
      const inserted = await db.query<SessionRow>(
        "INSERT INTO combat_sessions (character_id, kind, status, target_def_id, seed, state) VALUES ($1, 'pve', 'ongoing', $2, $3, $4) RETURNING id, target_def_id, status, seed, state",
        [character.id, primary.id, seed, JSON.stringify(state)],
      );
      const session = inserted.rows[0]!;
      await db.query(
        "INSERT INTO combat_events (session_id, seq, type, payload) VALUES ($1, 0, 'battle_start', $2)",
        [
          session.id,
          JSON.stringify({
            seed,
            foeCount: encounter.length,
            foeNames: encounter.map((npc) => npc.name),
            foeNpcIds: encounter.map((npc) => npc.id),
          }),
        ],
      );
      return toView(session, ctx);
    },

    async action(accountId, input) {
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
      const ctx = await contextOf(character);
      const {
        action: playerAction,
        usedPerformId,
        rngCallsUsed,
      } = resolvePlayerAction(input, state, ctx, session.seed);
      const stateForRound: BattleState = { ...state, rngCalls: state.rngCalls + rngCallsUsed };
      const round = advanceBattleRound(stateForRound, {
        seed: session.seed,
        params: content.params,
        playerAction,
        opponentAction: { type: "attack" },
        ...(input.targetId ? { targetId: input.targetId } : {}),
      });
      const finished = round.state.winner !== undefined;
      const result =
        round.state.fled === PLAYER_ACTOR
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
        const defeatedIds = targetIdsOf(nextState, session.target_def_id);
        const rng = createSeededRng(session.seed);
        for (let i = 0; i < nextState.rngCalls; i += 1) rng();
        let totalExp = 0;
        let totalPotential = 0;
        let totalSilver = 0;
        const allDrops: Array<{ itemId: string; count: number }> = [];
        for (const npcId of defeatedIds) {
          const target = content.npcs.find((npc) => npc.id === npcId);
          if (!target) continue;
          const drops = rollDrops(rng, target.drops, character.exp);
          allDrops.push(...drops);
          totalExp += target.battleRewards.exp;
          totalPotential += target.battleRewards.potential;
          totalSilver += target.battleRewards.silver;
        }
        const dropsForEvent: Json[] = allDrops.map((drop) => ({
          itemId: drop.itemId,
          count: drop.count,
        }));
        events.push({
          seq: nextState.nextSeq,
          type: "reward",
          actor: PLAYER_ACTOR,
          data: {
            exp: totalExp,
            potential: totalPotential,
            silver: totalSilver,
            drops: dropsForEvent,
          },
        });
        nextState.nextSeq += 1;
        for (const npcId of defeatedIds) {
          const progress = await quests?.recordProgress(accountId, "kill", npcId);
          if (progress) {
            events.push({
              seq: nextState.nextSeq,
              type: "quest_progress",
              actor: PLAYER_ACTOR,
              data: progress,
            });
            nextState.nextSeq += 1;
          }
        }
        await db.query(
          "UPDATE characters SET qi = $1, jing = $2, neili = $3, exp = exp + $4, potential = potential + $5, silver = silver + $6 WHERE id = $7",
          [
            nextState.combatants[PLAYER_ACTOR]!.qi,
            nextState.combatants[PLAYER_ACTOR]!.jing,
            nextState.combatants[PLAYER_ACTOR]!.neili,
            totalExp,
            totalPotential,
            totalSilver,
            character.id,
          ],
        );
        for (const drop of allDrops) {
          await db.query(
            "INSERT INTO character_items (character_id, item_def_id, quantity) VALUES ($1, $2, $3)",
            [character.id, drop.itemId, drop.count],
          );
        }
      } else {
        await db.query("UPDATE characters SET qi = $1, jing = $2, neili = $3 WHERE id = $4", [
          nextState.combatants[PLAYER_ACTOR]!.qi,
          nextState.combatants[PLAYER_ACTOR]!.jing,
          nextState.combatants[PLAYER_ACTOR]!.neili,
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
        ctx,
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
      return row ? toView(row, await contextOf(character)) : null;
    },
  };
}
