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
  get(actor: ActorKey): CombatantView;
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
  | { type: "perform"; effect: PerformEffect; cost: PerformCost };

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
  actor?: ActorKey;
  data: Json;
}

export interface BattleResult {
  winner: ActorKey | "draw";
  /** 逃跑方（若以逃跑结束）。 */
  fled?: ActorKey;
  events: BattleEvent[];
  turns: number;
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
            });
          } else {
            const healed = Math.min(action.effect.flat, c[actor].maxQi - c[actor].qi);
            c[actor].qi += healed;
            push("perform", actor, { heal: healed, qi: c[actor].qi });
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

  return { winner, fled, events, turns };
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
