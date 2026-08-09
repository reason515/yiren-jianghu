import type { Json } from "@yjh/shared";
import type { GameParams } from "./params.js";
import { chance, createSeededRng, type Rng } from "./random.js";

/**
 * C3 战斗引擎 v1（回合制、确定性、纯函数）。
 *
 * 参照 pkuxkx include/combat/damage.h 的 calc_damage 思路（命中三态、分系伤害、减伤），
 * 但重设计为参数驱动的简化模型：
 * - 回合制交替行动（先手固定 A，先手机制留作扩展）
 * - 命中 → 躲闪 → 招架 三态判定（招架减伤 70%）
 * - 伤害 = max(1, (攻击 + 武器等级×系数 + 内功等级×系数 − 防御×减伤) × 浮动)
 * - 行动由 ActionSelector 决定（手动按钮/战术模板 C6/PVP C8 共用此接口）
 * - 全部随机经 seeded RNG：同 seed 同输入 → 完全相同的战报
 */

export type DamageType = "physical" | "force";

export interface CombatStats {
  attack: number;
  defense: number;
  dodge: number;
  parry: number;
  weaponLevel: number;
  forceLevel: number;
}

export interface Combatant {
  id: string;
  name: string;
  qi: number;
  maxQi: number;
  jing: number;
  maxJing: number;
  neili: number;
  maxNeili: number;
  stats: CombatStats;
}

export type ActorKey = "a" | "b";

/** 选择器可见的只读视图。 */
export interface CombatantView {
  qi: number;
  maxQi: number;
  jing: number;
  maxJing: number;
  neili: number;
  maxNeili: number;
  stats: CombatStats;
}

export interface BattleContext {
  turn: number;
  /** 玩家为 `a`；敌方为 `b`/`b0`…（DC-038）。 */
  get(actor: string): CombatantView;
}

export type PerformEffect =
  { kind: "damage"; type: DamageType; flat: number } | { kind: "heal"; flat: number };

export interface PerformCost {
  qi?: number;
  jing?: number;
  neili?: number;
}

export type BattleAction =
  | { type: "attack" }
  | { type: "recover" }
  | { type: "flee" }
  | { type: "perform"; performId?: string; effect: PerformEffect; cost: PerformCost };

export type ActionSelector = (ctx: BattleContext, actor: ActorKey, rng: Rng) => BattleAction;

export interface BattleInput {
  a: Combatant;
  b: Combatant;
  selectors: Record<ActorKey, ActionSelector>;
  seed: number;
  params: GameParams;
  maxTurns?: number;
}

export interface BattleEvent {
  seq: number;
  type: string;
  /** 行动方：`a` 或敌方槽位键；1v1 runBattle 仍用 `a`/`b`。 */
  actor?: string;
  data: Json;
}

/** PVE 同场敌方上限（DC-038）。 */
export const MAX_COMBAT_FOES = 5;

export const PLAYER_ACTOR = "a" as const;

export interface BattleResult {
  winner: ActorKey | "draw";
  /** 逃跑方（若以逃跑结束）。 */
  fled?: ActorKey;
  events: BattleEvent[];
  turns: number;
  /** 终局战斗体；PVE/挂机以它落库资源，PVP 只将其视为回放辅助。 */
  combatants: Record<ActorKey, Combatant>;
}

// ---------- 命中三态与伤害（纯函数，可单测） ----------

export function clampRate(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function hitRate(p: GameParams, atk: CombatantView, def: CombatantView): number {
  return clampRate(
    p.combat.baseHitRate + (atk.stats.attack - def.stats.dodge) * p.combat.hitPerAttackDiff,
    0.05,
    0.95,
  );
}

export function dodgeRate(p: GameParams, def: CombatantView, atk: CombatantView): number {
  return clampRate(
    p.combat.baseDodgeRate + (def.stats.dodge - atk.stats.attack) * p.combat.dodgePerDodgeDiff,
    0,
    0.6,
  );
}

export function parryRate(p: GameParams, def: CombatantView, atk: CombatantView): number {
  return clampRate(
    p.combat.baseParryRate + (def.stats.parry - atk.stats.attack) * p.combat.parryPerParryDiff,
    0,
    0.5,
  );
}

export function computeAttackDamage(
  p: GameParams,
  atk: CombatantView,
  def: CombatantView,
  rng: Rng,
): number {
  const base =
    atk.stats.attack +
    atk.stats.weaponLevel * p.combat.weaponDmgPerLevel +
    atk.stats.forceLevel * p.combat.forceDmgPerLevel -
    def.stats.defense * p.combat.defenseReduce;
  const variance = 1 + (rng() * 2 - 1) * p.combat.damageVariance;
  return Math.max(1, Math.round(base * variance));
}

export type AttackOutcome =
  | { type: "miss"; hitRate: number }
  | { type: "dodge"; dodgeRate: number }
  | { type: "parry"; parryRate: number; damage: number }
  | { type: "damage"; damage: number };

export function resolveAttack(
  p: GameParams,
  atk: CombatantView,
  def: CombatantView,
  rng: Rng,
): AttackOutcome {
  const hRate = hitRate(p, atk, def);
  if (!chance(rng, hRate)) return { type: "miss", hitRate: hRate };
  const dRate = dodgeRate(p, def, atk);
  if (chance(rng, dRate)) return { type: "dodge", dodgeRate: dRate };
  const pRate = parryRate(p, def, atk);
  if (chance(rng, pRate)) {
    const full = computeAttackDamage(p, atk, def, rng);
    return { type: "parry", parryRate: pRate, damage: Math.max(1, Math.round(full * 0.3)) };
  }
  return { type: "damage", damage: computeAttackDamage(p, atk, def, rng) };
}

// ---------- 战斗循环 ----------

const TURN_ORDER: ActorKey[] = ["a", "b"];

export function runBattle(input: BattleInput): BattleResult {
  const rng = createSeededRng(input.seed);
  const c: Record<ActorKey, Combatant> = {
    a: { ...input.a },
    b: { ...input.b },
  };
  const maxTurns = input.maxTurns ?? 100;
  const events: BattleEvent[] = [];
  let seq = 0;
  let fled: ActorKey | undefined;

  const push = (type: string, actor?: ActorKey, data: Json = {}): void => {
    events.push({ seq: seq++, type, actor, data });
  };

  const view = (actor: ActorKey): CombatantView => ({
    qi: c[actor].qi,
    maxQi: c[actor].maxQi,
    jing: c[actor].jing,
    maxJing: c[actor].maxJing,
    neili: c[actor].neili,
    maxNeili: c[actor].maxNeili,
    stats: c[actor].stats,
  });

  push("battle_start", undefined, { seed: input.seed });

  let turns = 0;
  let winner: ActorKey | "draw" | null = null;

  while (winner === null && turns < maxTurns) {
    turns += 1;
    push("turn_start", undefined, { turn: turns });
    for (const actor of TURN_ORDER) {
      const foe: ActorKey = actor === "a" ? "b" : "a";
      if (c[actor].qi <= 0 || c[foe].qi <= 0) break;

      const ctx: BattleContext = { turn: turns, get: view };
      const action = input.selectors[actor](ctx, actor, rng);

      switch (action.type) {
        case "attack": {
          const outcome = resolveAttack(input.params, view(actor), view(foe), rng);
          if (outcome.type === "damage" || outcome.type === "parry") {
            c[foe].qi = Math.max(0, c[foe].qi - outcome.damage);
          }
          push(outcome.type, actor, { ...outcome });
          break;
        }
        case "recover": {
          const gained = input.params.combat.recoverNeiliPerTurn;
          c[actor].neili = Math.min(c[actor].maxNeili, c[actor].neili + gained);
          push("recover", actor, { gained, neili: c[actor].neili });
          break;
        }
        case "flee": {
          const success = chance(rng, input.params.combat.fleeBaseChance);
          if (success) {
            fled = actor;
            push("flee", actor, { success: true });
            winner = "draw";
          } else {
            push("flee", actor, { success: false });
          }
          break;
        }
        case "perform": {
          const cost = action.cost;
          const hasCost =
            c[actor].neili >= (cost.neili ?? 0) &&
            c[actor].jing >= (cost.jing ?? 0) &&
            c[actor].qi >= (cost.qi ?? 0);
          if (!hasCost) {
            push("perform_failed", actor, { reason: "insufficient_cost" });
            break;
          }
          c[actor].neili -= cost.neili ?? 0;
          c[actor].jing -= cost.jing ?? 0;
          c[actor].qi -= cost.qi ?? 0;
          if (action.effect.kind === "damage") {
            const damage = Math.max(1, Math.round(action.effect.flat));
            c[foe].qi = Math.max(0, c[foe].qi - damage);
            push("perform", actor, {
              damage,
              type: action.effect.type,
              remainingNeili: c[actor].neili,
              ...(action.performId ? { performId: action.performId } : {}),
            });
          } else {
            const healed = Math.min(action.effect.flat, c[actor].maxQi - c[actor].qi);
            c[actor].qi += healed;
            push("perform", actor, {
              heal: healed,
              qi: c[actor].qi,
              ...(action.performId ? { performId: action.performId } : {}),
            });
          }
          break;
        }
      }

      if (c[foe].qi <= 0) {
        winner = actor;
        push("victory", actor, { target: foe });
        break;
      }
    }
  }

  if (winner === null) {
    winner = "draw";
    push("draw", undefined, { turns });
  }

  return {
    winner,
    ...(fled ? { fled } : {}),
    events,
    turns,
    combatants: { a: { ...c.a }, b: { ...c.b } },
  };
}

// ---------- 持久化逐回合推进（PVE 服务端，支持 1vN / DC-038） ----------

/**
 * 可序列化的战斗续算状态。seed 保存在调用方的会话记录中；rngCalls 让服务端
 * 每次从同一个 seed 恢复随机序列，而不把 RNG 闭包交给客户端。
 */
export interface BattleState {
  /** 玩家键恒为 `a`；敌方为 `b0`… 或旧会话的 `b`。 */
  combatants: Record<string, Combatant>;
  /** 敌方槽位键有序列表；缺省时由 normalizeBattleState 从 combatants 推导。 */
  foeIds?: string[];
  /** 敌方槽位 → 内容包 NPC id（结算/任务推进，DC-038）。 */
  foeNpcIds?: Record<string, string>;
  turn: number;
  rngCalls: number;
  nextSeq: number;
  /** 已施展绝招的最近回合；由服务端持久化，断线恢复后仍遵守冷却。 */
  performCooldowns: Record<string, number>;
  /** `a` 清场获胜；`b` 表示敌方获胜（玩家气尽）；draw 含逃跑成功。 */
  winner?: ActorKey | "draw";
  fled?: string;
}

export interface BattleRoundInput {
  /** 会话建立即固定的随机种子。 */
  seed: number;
  params: GameParams;
  /** 玩家本回合意图；客户端只能提交此字段。 */
  playerAction: BattleAction;
  /** 指定敌方槽位；缺省打气最低的存活敌人。 */
  targetId?: string;
  /**
   * 每名存活敌人的动作（缺省普攻）。
   * 兼容旧调用：若未传 foeActions，则全体敌人使用 opponentAction（默认 attack）。
   */
  opponentAction?: BattleAction;
  foeActions?: Record<string, BattleAction>;
  maxTurns?: number;
}

export interface BattleRoundResult {
  state: BattleState;
  events: BattleEvent[];
}

function cloneCombatant(c: Combatant): Combatant {
  return { ...c, stats: { ...c.stats } };
}

/** 补全 foeIds，兼容仅有 `a`/`b` 的旧会话。 */
export function normalizeBattleState(state: BattleState): BattleState {
  if (state.foeIds && state.foeIds.length > 0) {
    return state;
  }
  if (state.combatants.b) {
    return { ...state, foeIds: ["b"] };
  }
  const foeIds = Object.keys(state.combatants)
    .filter((key) => key !== PLAYER_ACTOR)
    .sort();
  return { ...state, foeIds };
}

export function aliveFoeIds(state: BattleState): string[] {
  const normalized = normalizeBattleState(state);
  return (normalized.foeIds ?? []).filter((id) => (normalized.combatants[id]?.qi ?? 0) > 0);
}

/** 气最低优先，并列按槽位键字典序（确定性）。 */
export function pickAutoTarget(state: BattleState, preferred?: string): string | undefined {
  const alive = aliveFoeIds(state);
  if (alive.length === 0) return undefined;
  if (preferred && alive.includes(preferred)) return preferred;
  let best = alive[0]!;
  let bestQi = state.combatants[best]!.qi;
  for (const id of alive.slice(1)) {
    const qi = state.combatants[id]!.qi;
    if (qi < bestQi || (qi === bestQi && id < best)) {
      best = id;
      bestQi = qi;
    }
  }
  return best;
}

/**
 * 新开战斗的初始状态；battle_start 由调用方作为 seq=0 的首个事件持久化。
 * `foes` 可为单人或数组（最多 MAX_COMBAT_FOES）。
 */
export function createBattleState(a: Combatant, foes: Combatant | Combatant[]): BattleState {
  const list = (Array.isArray(foes) ? foes : [foes]).slice(0, MAX_COMBAT_FOES);
  if (list.length === 0) {
    throw new Error("createBattleState requires at least one foe");
  }
  const combatants: Record<string, Combatant> = {
    [PLAYER_ACTOR]: cloneCombatant(a),
  };
  const foeIds: string[] = [];
  list.forEach((foe, index) => {
    const slot = `b${index}`;
    foeIds.push(slot);
    combatants[slot] = cloneCombatant(foe);
  });
  return {
    combatants,
    foeIds,
    turn: 0,
    rngCalls: 0,
    nextSeq: 1,
    performCooldowns: {},
  };
}

/**
 * 推进一个完整回合：先处理玩家动作，再令全部存活敌人各动一次。
 * 函数不做 IO，且不修改传入 state；同输入必定得到同一状态与事件流。
 */
export function advanceBattleRound(state: BattleState, input: BattleRoundInput): BattleRoundResult {
  if (state.winner !== undefined) return { state, events: [] };

  const base = normalizeBattleState(state);
  const combatants: Record<string, Combatant> = {};
  for (const [key, value] of Object.entries(base.combatants)) {
    combatants[key] = cloneCombatant(value);
  }
  const foeIds = [...(base.foeIds ?? [])];
  const seeded = createSeededRng(input.seed);
  for (let i = 0; i < state.rngCalls; i += 1) seeded();
  let rngCalls = state.rngCalls;
  const rng: Rng = () => {
    rngCalls += 1;
    return seeded();
  };
  const events: BattleEvent[] = [];
  let nextSeq = state.nextSeq;
  let winner: ActorKey | "draw" | undefined;
  let fled: string | undefined;
  const turn = state.turn + 1;
  const defaultFoeAction: BattleAction = input.opponentAction ?? { type: "attack" };

  const push = (type: string, actor?: string, data: Json = {}): void => {
    events.push({ seq: nextSeq++, type, actor, data });
  };
  const view = (actor: string): CombatantView => {
    const c = combatants[actor]!;
    return {
      qi: c.qi,
      maxQi: c.maxQi,
      jing: c.jing,
      maxJing: c.maxJing,
      neili: c.neili,
      maxNeili: c.maxNeili,
      stats: c.stats,
    };
  };
  const livingFoes = (): string[] => foeIds.filter((id) => (combatants[id]?.qi ?? 0) > 0);

  const resolveTarget = (preferred?: string): string | undefined => {
    const alive = livingFoes();
    if (alive.length === 0) return undefined;
    if (preferred && alive.includes(preferred)) return preferred;
    let best = alive[0]!;
    let bestQi = combatants[best]!.qi;
    for (const id of alive.slice(1)) {
      const qi = combatants[id]!.qi;
      if (qi < bestQi || (qi === bestQi && id < best)) {
        best = id;
        bestQi = qi;
      }
    }
    return best;
  };

  const markDownIfNeeded = (foeId: string, wasAlive: boolean): void => {
    if (!wasAlive) return;
    if ((combatants[foeId]?.qi ?? 0) > 0) return;
    push("foe_down", foeId, { name: combatants[foeId]?.name ?? foeId });
  };

  const checkClearOrPlayerDown = (): void => {
    if (livingFoes().length === 0) {
      winner = "a";
      push("victory", PLAYER_ACTOR, { cleared: true });
      return;
    }
    if ((combatants[PLAYER_ACTOR]?.qi ?? 0) <= 0) {
      winner = "b";
      push("victory", livingFoes()[0] ?? foeIds[0], { target: PLAYER_ACTOR });
    }
  };

  const actPlayer = (action: BattleAction): void => {
    const actor = PLAYER_ACTOR;
    switch (action.type) {
      case "attack": {
        const foe = resolveTarget(input.targetId);
        if (!foe) break;
        const wasAlive = combatants[foe]!.qi > 0;
        const outcome = resolveAttack(input.params, view(actor), view(foe), rng);
        if (outcome.type === "damage" || outcome.type === "parry") {
          combatants[foe]!.qi = Math.max(0, combatants[foe]!.qi - outcome.damage);
        }
        push(outcome.type, actor, { ...outcome, targetId: foe });
        markDownIfNeeded(foe, wasAlive);
        break;
      }
      case "recover": {
        const gained = input.params.combat.recoverNeiliPerTurn;
        combatants[actor]!.neili = Math.min(
          combatants[actor]!.maxNeili,
          combatants[actor]!.neili + gained,
        );
        push("recover", actor, { gained, neili: combatants[actor]!.neili });
        break;
      }
      case "flee": {
        const success = chance(rng, input.params.combat.fleeBaseChance);
        push("flee", actor, { success });
        if (success) {
          fled = actor;
          winner = "draw";
        }
        break;
      }
      case "perform": {
        const cost = action.cost;
        const hasCost =
          combatants[actor]!.neili >= (cost.neili ?? 0) &&
          combatants[actor]!.jing >= (cost.jing ?? 0) &&
          combatants[actor]!.qi >= (cost.qi ?? 0);
        if (!hasCost) {
          push("perform_failed", actor, { reason: "insufficient_cost" });
          break;
        }
        combatants[actor]!.neili -= cost.neili ?? 0;
        combatants[actor]!.jing -= cost.jing ?? 0;
        combatants[actor]!.qi -= cost.qi ?? 0;
        if (action.effect.kind === "damage") {
          const foe = resolveTarget(input.targetId);
          if (!foe) break;
          const wasAlive = combatants[foe]!.qi > 0;
          const damage = Math.max(1, Math.round(action.effect.flat));
          combatants[foe]!.qi = Math.max(0, combatants[foe]!.qi - damage);
          push("perform", actor, {
            damage,
            type: action.effect.type,
            remainingNeili: combatants[actor]!.neili,
            targetId: foe,
            ...(action.performId ? { performId: action.performId } : {}),
          });
          markDownIfNeeded(foe, wasAlive);
        } else {
          const healed = Math.min(
            action.effect.flat,
            combatants[actor]!.maxQi - combatants[actor]!.qi,
          );
          combatants[actor]!.qi += healed;
          push("perform", actor, {
            heal: healed,
            qi: combatants[actor]!.qi,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        }
        break;
      }
    }
    if (winner === undefined) checkClearOrPlayerDown();
  };

  const actFoe = (foeId: string, action: BattleAction): void => {
    if ((combatants[foeId]?.qi ?? 0) <= 0) return;
    if ((combatants[PLAYER_ACTOR]?.qi ?? 0) <= 0) return;
    const target = PLAYER_ACTOR;
    switch (action.type) {
      case "attack": {
        const outcome = resolveAttack(input.params, view(foeId), view(target), rng);
        if (outcome.type === "damage" || outcome.type === "parry") {
          combatants[target]!.qi = Math.max(0, combatants[target]!.qi - outcome.damage);
        }
        push(outcome.type, foeId, { ...outcome, targetId: target });
        break;
      }
      case "recover": {
        const gained = input.params.combat.recoverNeiliPerTurn;
        combatants[foeId]!.neili = Math.min(
          combatants[foeId]!.maxNeili,
          combatants[foeId]!.neili + gained,
        );
        push("recover", foeId, { gained, neili: combatants[foeId]!.neili });
        break;
      }
      case "flee": {
        push("flee", foeId, { success: false });
        break;
      }
      case "perform": {
        const cost = action.cost;
        const hasCost =
          combatants[foeId]!.neili >= (cost.neili ?? 0) &&
          combatants[foeId]!.jing >= (cost.jing ?? 0) &&
          combatants[foeId]!.qi >= (cost.qi ?? 0);
        if (!hasCost) {
          push("perform_failed", foeId, { reason: "insufficient_cost" });
          break;
        }
        combatants[foeId]!.neili -= cost.neili ?? 0;
        combatants[foeId]!.jing -= cost.jing ?? 0;
        combatants[foeId]!.qi -= cost.qi ?? 0;
        if (action.effect.kind === "damage") {
          const damage = Math.max(1, Math.round(action.effect.flat));
          combatants[target]!.qi = Math.max(0, combatants[target]!.qi - damage);
          push("perform", foeId, {
            damage,
            type: action.effect.type,
            remainingNeili: combatants[foeId]!.neili,
            targetId: target,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        } else {
          const healed = Math.min(
            action.effect.flat,
            combatants[foeId]!.maxQi - combatants[foeId]!.qi,
          );
          combatants[foeId]!.qi += healed;
          push("perform", foeId, {
            heal: healed,
            qi: combatants[foeId]!.qi,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        }
        break;
      }
    }
    if (winner === undefined) checkClearOrPlayerDown();
  };

  push("turn_start", undefined, { turn });
  actPlayer(input.playerAction);
  if (winner === undefined) {
    for (const foeId of livingFoes()) {
      if (winner !== undefined) break;
      const action = input.foeActions?.[foeId] ?? defaultFoeAction;
      actFoe(foeId, action);
    }
  }
  if (winner === undefined && turn >= (input.maxTurns ?? 100)) {
    winner = "draw";
    push("draw", undefined, { turns: turn });
  }

  return {
    state: {
      combatants,
      foeIds,
      ...(base.foeNpcIds ? { foeNpcIds: { ...base.foeNpcIds } } : {}),
      turn,
      rngCalls,
      nextSeq,
      performCooldowns: { ...state.performCooldowns },
      ...(winner !== undefined ? { winner } : {}),
      ...(fled ? { fled } : {}),
    },
    events,
  };
}

// ---------- 内置选择器（测试与占位） ----------

/** 只会普通攻击（手动战斗占位）。 */
export const attackOnly: ActionSelector = () => ({ type: "attack" });

/** 内力低于 30% 时回气，否则攻击。 */
export const attackOrRecover: ActionSelector = (ctx, actor) => {
  const v = ctx.get(actor);
  if (v.maxNeili > 0 && v.neili / v.maxNeili < 0.3) return { type: "recover" };
  return { type: "attack" };
};
