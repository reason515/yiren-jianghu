import type { Json } from "@yjh/shared";
import { evalFormulaWithCoeffs, type CompiledMechanics } from "@yjh/content";
import { DEFAULT_MECHANICS, type GameParams } from "./params.js";
import { chance, createSeededRng, type Rng } from "./random.js";
import { skillPower } from "./skillPower.js";

/**
 * C3 战斗引擎 v1（回合制、确定性、纯函数）。
 *
 * 参照 pkuxkx include/combat/probable.h 的 skill_power 思路（DC-041 起改用其作为命中/闪避/
 * 招架的 A/(A+B) 概率基础），重设计为参数驱动的简化模型：
 * - 回合制交替行动（先手固定 A，先手机制留作扩展）
 * - 闪避 → 招架 二态判定（不再设独立的“未命中”态；招架减伤 70%）
 * - 伤害 = max(1, 攻击 + 武器等级×系数 + 内功等级×系数 − 防御×减伤)，绝招按 move.damage/force 加成后再浮动
 * - 行动由 ActionSelector 决定（手动按钮/战术模板 C6/PVP C8 共用此接口）
 * - 全部随机经 seeded RNG：同 seed 同输入 → 完全相同的战报
 */

export type DamageType = "physical" | "force";

/**
 * 战斗数值（DC-041：门类等级改由 combatant.ts 的 enable 有效等级注入）。
 * attack/defense/dodge/parry 保留作叙事/兼容展示；命中判定实际读取 *SkillLevel + combatExp + str/dex。
 */
export interface CombatStats {
  /** 兼容展示：str + 有效攻击槎（武器/空手）等级。 */
  attack: number;
  defense: number;
  dodge: number;
  parry: number;
  /** 有效攻击槎（sword 或 unarmed）等级。 */
  weaponLevel: number;
  /** 有效内功等级。 */
  forceLevel: number;
  /** 有效攻击槎等级（skillPower 用；与 weaponLevel 同值，语义命名）。 */
  attackSkillLevel: number;
  /** 有效身法（dodge）等级。 */
  dodgeSkillLevel: number;
  /** 有效招架（parry）等级。 */
  parrySkillLevel: number;
  /** 战斗经验（pkuxkx combat_exp，随对战积累，C11 起接入）。 */
  combatExp: number;
  str: number;
  dex: number;
  con: number;
}

/** 普攻抽中的招式信息（DC-041：由 movePick 挑选，供伤害加成与战报叙事）。 */
export interface MoveInfo {
  id: string;
  name: string;
  /** 伤害百分比加成。 */
  damage: number;
  /** 内功发力加成。 */
  force: number;
  /** 身法修正：加成攻方命中侧有效等级（DC-047）。 */
  dodge?: number;
}

export interface Combatant {
  id: string;
  name: string;
  qi: number;
  maxQi: number;
  /** 伤势后的有效气血上限（≤ maxQi）；回气不超过此值（DC-048）。 */
  effQi?: number;
  jing: number;
  maxJing: number;
  effJing?: number;
  neili: number;
  maxNeili: number;
  stats: CombatStats;
  /** 叙事用：人/兽/鸟（DC 内容驱动；缺省按人）。 */
  nature?: "human" | "beast" | "bird";
  /** 本场普攻走的攻击槎（DC-041：有兵器→sword，否则 unarmed）。 */
  attackSkillSlot?: "sword" | "unarmed";
  /** 各槎有效等级快照（叙事/调试用；命中判定以 stats.*SkillLevel 为准）。 */
  effective?: {
    force: number;
    dodge: number;
    parry: number;
    weapon: number;
    unarmed?: number;
  };
  /** 战斗经验（与 stats.combatExp 同值，顶层留一份便于服务端直接读取）。 */
  exp?: number;
  /** 剩余忙乱回合（DC-049）；>0 时禁普攻。 */
  busyTurns?: number;
  /** 加力档位 0–3（DC-048）。 */
  jiali?: number;
  /** 临时防御加成与剩余回合（护体 buff）。 */
  defenseBuff?: number;
  defenseBuffTurns?: number;
  /** 演示毒：剩余回合与每回扣气（DC-049）。 */
  poisonTurns?: number;
  poisonDmg?: number;
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
  | { kind: "damage"; type: DamageType; flat: number }
  | { kind: "heal"; flat: number }
  | { kind: "cure"; flat: number }
  | { kind: "buff"; flat: number; durationTurns: number };

export interface PerformCost {
  qi?: number;
  jing?: number;
  neili?: number;
}

export type BattleAction =
  | { type: "attack"; move?: MoveInfo }
  | { type: "recover" }
  | { type: "flee" }
  | { type: "set_jiali"; level: number }
  | { type: "perform"; performId?: string; effect: PerformEffect; cost: PerformCost };

export type ActionSelector = (ctx: BattleContext, actor: ActorKey, rng: Rng) => BattleAction;

export interface BattleInput {
  a: Combatant;
  b: Combatant;
  selectors: Record<ActorKey, ActionSelector>;
  seed: number;
  params: GameParams;
  /** 缺省用 DEFAULT_MECHANICS；生产传入 content.compiled。 */
  mechanics?: CompiledMechanics;
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

// ---------- 命中判定与伤害（纯函数，可单测） ----------

/** 闪避/招架概率夹逼（DC-050）：强弱差大时仍保留意外。 */
export function clampHitChance(raw: number, p: GameParams): number {
  const floor = p.combat.hitChanceFloor ?? 0.15;
  const ceil = p.combat.hitChanceCeil ?? 0.85;
  return Math.min(ceil, Math.max(floor, raw));
}

/**
 * 弱打强伤害软帽（DC-050）：攻方战力低于守方时按 sqrt(ratio) 衰减，不低于 underdogDamageFloor。
 * 简化 pkuxkx 经验差压伤，避免 while+random 难测。
 */
export function underdogDamageFactor(ap: number, defPower: number, p: GameParams): number {
  const floor = p.combat.underdogDamageFloor ?? 0.25;
  if (defPower <= 0 || ap >= defPower) return 1;
  const ratio = ap / defPower;
  return Math.max(floor, Math.sqrt(ratio));
}

/**
 * 伤害基数 + 招式加成 + 加力 + 弱方软帽 + 浮动（DC-041 / DC-048 / DC-050）。
 * move 提供时：先按 `(100+move.damage)/100` 放大基数，再叠加 `内功等级×move.force/100` 的发力加成。
 * jiali>0 时额外加伤并在调用方扣内力。
 */
export function computeAttackDamage(
  p: GameParams,
  atk: CombatantView,
  def: CombatantView,
  rng: Rng,
  move?: MoveInfo,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
  jiali = 0,
  defenseBuff = 0,
): number {
  let base = evalFormulaWithCoeffs(mechanics, p, "attackDamageBase", {
    atk: atk.stats.attack,
    def: def.stats.defense + defenseBuff,
    weaponLevel: atk.stats.weaponLevel,
    forceLevel: atk.stats.forceLevel,
  });
  if (jiali > 0) {
    const per = p.combat.jialiDmgPerLevel ?? 4;
    base += jiali * per;
  }
  if (move) {
    base = evalFormulaWithCoeffs(mechanics, p, "moveDamageApplied", {
      base,
      moveDamage: move.damage,
      moveForce: move.force,
      forceLevel: atk.stats.forceLevel,
    });
  }
  const atkAttrs = { str: atk.stats.str, dex: atk.stats.dex };
  const defAttrs = { str: def.stats.str, dex: def.stats.dex };
  const attackLevel = atk.stats.attackSkillLevel + Math.max(0, move?.dodge ?? 0);
  const ap = skillPower(attackLevel, atk.stats.combatExp, atkAttrs, "attack", p, mechanics);
  const dp = skillPower(
    def.stats.dodgeSkillLevel,
    def.stats.combatExp,
    defAttrs,
    "defense",
    p,
    mechanics,
  );
  const pp = skillPower(
    def.stats.parrySkillLevel,
    def.stats.combatExp,
    defAttrs,
    "defense",
    p,
    mechanics,
  );
  base *= underdogDamageFactor(ap, Math.max(dp, pp), p);
  const variance = 1 + (rng() * 2 - 1) * p.combat.damageVariance;
  return Math.max(1, Math.round(base * variance));
}

/** 伤势：按比例压低 effQi，并钳制当前气（DC-048）。 */
export function applyCombatDamage(target: Combatant, damage: number, p: GameParams): number {
  const dealt = Math.max(0, Math.min(target.qi, damage));
  target.qi = Math.max(0, target.qi - dealt);
  const factor = p.combat.woundFactor ?? 0.35;
  const wound = Math.max(0, Math.floor(dealt * factor));
  const effCap = target.effQi ?? target.maxQi;
  target.effQi = Math.max(1, Math.min(target.maxQi, effCap - wound));
  if (target.qi > target.effQi) target.qi = target.effQi;
  return dealt;
}

/** 回气/heal：不超过 effQi。 */
export function applyHealQi(target: Combatant, amount: number): number {
  const eff = target.effQi ?? target.maxQi;
  const room = Math.max(0, eff - target.qi);
  const healed = Math.min(amount, room);
  target.qi += healed;
  return healed;
}

/** 疗伤：抬高 effQi（向 maxQi），并可选同步回一点气。 */
export function applyCureQi(target: Combatant, amount: number): number {
  const before = target.effQi ?? target.maxQi;
  target.effQi = Math.min(target.maxQi, before + amount);
  const raised = target.effQi - before;
  applyHealQi(target, Math.floor(raised / 2));
  return raised;
}

export type AttackOutcome =
  | { type: "dodge"; moveId?: string; moveName?: string; hook: "after_dodge" }
  | { type: "parry"; damage: number; moveId?: string; moveName?: string; hook: "after_parry" }
  | { type: "damage"; damage: number; moveId?: string; moveName?: string; hook: "after_hit" };

/**
 * 命中判定（DC-041 / DC-047 / DC-050）：
 * 1. ap = 攻方 skillPower(attackSkillLevel + move.dodge)；dp = 守方 skillPower(dodgeSkillLevel)；
 * 2. 闪避/招架概率夹逼后再骰；3. 均未触发则正常命中。
 */
export function resolveAttack(
  p: GameParams,
  atk: CombatantView,
  def: CombatantView,
  rng: Rng,
  move?: MoveInfo,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
  jiali = 0,
  defenseBuff = 0,
): AttackOutcome {
  const atkAttrs = { str: atk.stats.str, dex: atk.stats.dex };
  const defAttrs = { str: def.stats.str, dex: def.stats.dex };
  const attackLevel = atk.stats.attackSkillLevel + Math.max(0, move?.dodge ?? 0);
  const ap = skillPower(attackLevel, atk.stats.combatExp, atkAttrs, "attack", p, mechanics);
  const dp = skillPower(
    def.stats.dodgeSkillLevel,
    def.stats.combatExp,
    defAttrs,
    "defense",
    p,
    mechanics,
  );
  const dodgeRaw = ap + dp > 0 ? dp / (ap + dp) : 0.5;
  if (chance(rng, clampHitChance(dodgeRaw, p))) {
    return {
      type: "dodge",
      hook: "after_dodge",
      ...(move ? { moveId: move.id, moveName: move.name } : {}),
    };
  }
  const pp = skillPower(
    def.stats.parrySkillLevel,
    def.stats.combatExp,
    defAttrs,
    "defense",
    p,
    mechanics,
  );
  const parryRaw = ap + pp > 0 ? pp / (ap + pp) : 0.5;
  if (chance(rng, clampHitChance(parryRaw, p))) {
    const full = computeAttackDamage(p, atk, def, rng, move, mechanics, jiali, defenseBuff);
    return {
      type: "parry",
      damage: evalFormulaWithCoeffs(mechanics, p, "parryDamage", { fullDamage: full }),
      hook: "after_parry",
      ...(move ? { moveId: move.id, moveName: move.name } : {}),
    };
  }
  return {
    type: "damage",
    damage: computeAttackDamage(p, atk, def, rng, move, mechanics, jiali, defenseBuff),
    hook: "after_hit",
    ...(move ? { moveId: move.id, moveName: move.name } : {}),
  };
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
      // DC-049：回合初递减忙乱/护体；演示毒跳字
      if ((c[actor].poisonTurns ?? 0) > 0 && (c[actor].poisonDmg ?? 0) > 0) {
        applyCombatDamage(c[actor], c[actor].poisonDmg ?? 0, input.params);
        c[actor].poisonTurns = Math.max(0, (c[actor].poisonTurns ?? 0) - 1);
        push("poison_tick", actor, {
          damage: c[actor].poisonDmg ?? 0,
          remaining: c[actor].poisonTurns ?? 0,
        });
      }
      if ((c[actor].defenseBuffTurns ?? 0) > 0) {
        c[actor].defenseBuffTurns = Math.max(0, (c[actor].defenseBuffTurns ?? 0) - 1);
        if ((c[actor].defenseBuffTurns ?? 0) <= 0) c[actor].defenseBuff = 0;
      }
      if ((c[actor].busyTurns ?? 0) > 0) {
        c[actor].busyTurns = Math.max(0, (c[actor].busyTurns ?? 0) - 1);
      }
      const foe: ActorKey = actor === "a" ? "b" : "a";
      if (c[actor].qi <= 0 || c[foe].qi <= 0) break;

      const ctx: BattleContext = { turn: turns, get: view };
      const action = input.selectors[actor](ctx, actor, rng);

      switch (action.type) {
        case "attack": {
          const outcome = resolveAttack(
            input.params,
            view(actor),
            view(foe),
            rng,
            action.move,
            input.mechanics,
            c[actor].jiali ?? 0,
            c[foe].defenseBuff ?? 0,
          );
          if (outcome.type === "damage" || outcome.type === "parry") {
            applyCombatDamage(c[foe], outcome.damage, input.params);
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
        case "set_jiali": {
          c[actor].jiali = Math.max(0, Math.min(3, Math.floor(action.level)));
          push("set_jiali", actor, { jiali: c[actor].jiali });
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
          if ((c[actor].busyTurns ?? 0) > 0 && action.effect.kind === "damage") {
            push("busy", actor, { busyTurns: c[actor].busyTurns ?? 0 });
            break;
          }
          c[actor].neili -= cost.neili ?? 0;
          c[actor].jing -= cost.jing ?? 0;
          c[actor].qi -= cost.qi ?? 0;
          const busy = input.params.combat.performBusyTurns ?? 1;
          c[actor].busyTurns = Math.max(c[actor].busyTurns ?? 0, busy);
          if (action.effect.kind === "damage") {
            const damage = Math.max(1, Math.round(action.effect.flat));
            applyCombatDamage(c[foe], damage, input.params);
            push("perform", actor, {
              damage,
              type: action.effect.type,
              remainingNeili: c[actor].neili,
              busyTurns: c[actor].busyTurns ?? 0,
              ...(action.performId ? { performId: action.performId } : {}),
            });
          } else if (action.effect.kind === "cure") {
            const raised = applyCureQi(c[actor], action.effect.flat);
            push("perform", actor, {
              cure: raised,
              effQi: c[actor].effQi ?? c[actor].maxQi,
              qi: c[actor].qi,
              busyTurns: c[actor].busyTurns ?? 0,
              ...(action.performId ? { performId: action.performId } : {}),
            });
          } else if (action.effect.kind === "buff") {
            c[actor].defenseBuff = Math.max(c[actor].defenseBuff ?? 0, action.effect.flat);
            c[actor].defenseBuffTurns = Math.max(
              c[actor].defenseBuffTurns ?? 0,
              action.effect.durationTurns ?? 1,
            );
            push("perform", actor, {
              buff: c[actor].defenseBuff,
              busyTurns: c[actor].busyTurns ?? 0,
              ...(action.performId ? { performId: action.performId } : {}),
            });
          } else {
            const healed = applyHealQi(c[actor], action.effect.flat);
            push("perform", actor, {
              heal: healed,
              qi: c[actor].qi,
              busyTurns: c[actor].busyTurns ?? 0,
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
  mechanics?: CompiledMechanics;
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
  return {
    ...c,
    stats: { ...c.stats },
    effective: c.effective ? { ...c.effective } : undefined,
  };
}

function tickActorStatus(
  c: Combatant,
  p: GameParams,
  push: (type: string, actor?: string, data?: Json) => void,
  actorId: string,
): void {
  if ((c.poisonTurns ?? 0) > 0 && (c.poisonDmg ?? 0) > 0) {
    const dmg = c.poisonDmg ?? 0;
    applyCombatDamage(c, dmg, p);
    c.poisonTurns = Math.max(0, (c.poisonTurns ?? 0) - 1);
    push("poison_tick", actorId, { damage: dmg, remaining: c.poisonTurns });
  }
  if ((c.defenseBuffTurns ?? 0) > 0) {
    c.defenseBuffTurns = Math.max(0, (c.defenseBuffTurns ?? 0) - 1);
    if (c.defenseBuffTurns === 0) c.defenseBuff = 0;
  }
  if ((c.busyTurns ?? 0) > 0) {
    c.busyTurns = Math.max(0, (c.busyTurns ?? 0) - 1);
  }
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
    const self = combatants[actor]!;
    if (action.type === "attack" && (self.busyTurns ?? 0) > 0) {
      push("busy", actor, { busyTurns: self.busyTurns ?? 0 });
      return;
    }
    switch (action.type) {
      case "set_jiali": {
        self.jiali = Math.max(0, Math.min(3, Math.floor(action.level)));
        push("set_jiali", actor, { jiali: self.jiali });
        break;
      }
      case "attack": {
        const foe = resolveTarget(input.targetId);
        if (!foe) break;
        const jiali = self.jiali ?? 0;
        const neiliCost = jiali * (input.params.combat.jialiNeiliPerLevel ?? 5);
        if (jiali > 0 && self.neili < neiliCost) {
          push("attack_failed", actor, { reason: "neili" });
          break;
        }
        if (jiali > 0) self.neili -= neiliCost;
        const wasAlive = combatants[foe]!.qi > 0;
        const outcome = resolveAttack(
          input.params,
          view(actor),
          view(foe),
          rng,
          action.move,
          input.mechanics,
          jiali,
          combatants[foe]!.defenseBuff ?? 0,
        );
        if (outcome.type === "damage" || outcome.type === "parry") {
          applyCombatDamage(combatants[foe]!, outcome.damage, input.params);
        }
        push(outcome.type, actor, { ...outcome, targetId: foe, jiali });
        markDownIfNeeded(foe, wasAlive);
        break;
      }
      case "recover": {
        const gained = input.params.combat.recoverNeiliPerTurn;
        self.neili = Math.min(self.maxNeili, self.neili + gained);
        push("recover", actor, { gained, neili: self.neili });
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
          self.neili >= (cost.neili ?? 0) &&
          self.jing >= (cost.jing ?? 0) &&
          self.qi >= (cost.qi ?? 0);
        if (!hasCost) {
          push("perform_failed", actor, { reason: "insufficient_cost" });
          break;
        }
        self.neili -= cost.neili ?? 0;
        self.jing -= cost.jing ?? 0;
        self.qi -= cost.qi ?? 0;
        const busy = input.params.combat.performBusyTurns ?? 1;
        self.busyTurns = Math.max(self.busyTurns ?? 0, busy);
        if (action.effect.kind === "damage") {
          const foe = resolveTarget(input.targetId);
          if (!foe) break;
          const wasAlive = combatants[foe]!.qi > 0;
          const damage = Math.max(1, Math.round(action.effect.flat));
          applyCombatDamage(combatants[foe]!, damage, input.params);
          // 演示毒：伤害类绝招附带短暂中毒（DC-049）
          if ((input.params.combat.demoPoisonTurns ?? 0) > 0) {
            combatants[foe]!.poisonTurns = input.params.combat.demoPoisonTurns ?? 0;
            combatants[foe]!.poisonDmg = input.params.combat.demoPoisonDmg ?? 3;
          }
          push("perform", actor, {
            damage,
            type: action.effect.type,
            remainingNeili: self.neili,
            targetId: foe,
            busyTurns: self.busyTurns ?? 0,
            ...(action.performId ? { performId: action.performId } : {}),
          });
          markDownIfNeeded(foe, wasAlive);
        } else if (action.effect.kind === "cure") {
          const raised = applyCureQi(self, action.effect.flat);
          push("perform", actor, {
            cure: raised,
            effQi: self.effQi ?? self.maxQi,
            qi: self.qi,
            busyTurns: self.busyTurns ?? 0,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        } else if (action.effect.kind === "buff") {
          self.defenseBuff = action.effect.flat;
          self.defenseBuffTurns = action.effect.durationTurns;
          push("perform", actor, {
            buff: action.effect.flat,
            durationTurns: action.effect.durationTurns,
            busyTurns: self.busyTurns ?? 0,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        } else {
          const healed = applyHealQi(self, action.effect.flat);
          push("perform", actor, {
            heal: healed,
            qi: self.qi,
            busyTurns: self.busyTurns ?? 0,
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
    const foeC = combatants[foeId]!;
    if (action.type === "attack" && (foeC.busyTurns ?? 0) > 0) {
      push("busy", foeId, { busyTurns: foeC.busyTurns ?? 0 });
      return;
    }
    switch (action.type) {
      case "set_jiali":
        break;
      case "attack": {
        const outcome = resolveAttack(
          input.params,
          view(foeId),
          view(target),
          rng,
          action.move,
          input.mechanics,
          0,
          combatants[target]!.defenseBuff ?? 0,
        );
        if (outcome.type === "damage" || outcome.type === "parry") {
          applyCombatDamage(combatants[target]!, outcome.damage, input.params);
        }
        push(outcome.type, foeId, { ...outcome, targetId: target });
        break;
      }
      case "recover": {
        const gained = input.params.combat.recoverNeiliPerTurn;
        foeC.neili = Math.min(foeC.maxNeili, foeC.neili + gained);
        push("recover", foeId, { gained, neili: foeC.neili });
        break;
      }
      case "flee": {
        push("flee", foeId, { success: false });
        break;
      }
      case "perform": {
        const cost = action.cost;
        const hasCost =
          foeC.neili >= (cost.neili ?? 0) &&
          foeC.jing >= (cost.jing ?? 0) &&
          foeC.qi >= (cost.qi ?? 0);
        if (!hasCost) {
          push("perform_failed", foeId, { reason: "insufficient_cost" });
          break;
        }
        foeC.neili -= cost.neili ?? 0;
        foeC.jing -= cost.jing ?? 0;
        foeC.qi -= cost.qi ?? 0;
        if (action.effect.kind === "damage") {
          const damage = Math.max(1, Math.round(action.effect.flat));
          applyCombatDamage(combatants[target]!, damage, input.params);
          push("perform", foeId, {
            damage,
            type: action.effect.type,
            remainingNeili: foeC.neili,
            targetId: target,
            ...(action.performId ? { performId: action.performId } : {}),
          });
        } else if (action.effect.kind === "cure") {
          const raised = applyCureQi(foeC, action.effect.flat);
          push("perform", foeId, { cure: raised, effQi: foeC.effQi ?? foeC.maxQi, qi: foeC.qi });
        } else if (action.effect.kind === "buff") {
          foeC.defenseBuff = action.effect.flat;
          foeC.defenseBuffTurns = action.effect.durationTurns;
          push("perform", foeId, { buff: action.effect.flat });
        } else {
          const healed = applyHealQi(foeC, action.effect.flat);
          push("perform", foeId, { heal: healed, qi: foeC.qi });
        }
        break;
      }
    }
    if (winner === undefined) checkClearOrPlayerDown();
  };

  push("turn_start", undefined, { turn });
  tickActorStatus(combatants[PLAYER_ACTOR]!, input.params, push, PLAYER_ACTOR);
  for (const id of foeIds) {
    if (combatants[id]) tickActorStatus(combatants[id]!, input.params, push, id);
  }
  if ((combatants[PLAYER_ACTOR]?.qi ?? 0) <= 0) {
    winner = "b";
    push("victory", livingFoes()[0] ?? foeIds[0], { target: PLAYER_ACTOR });
  }
  if (winner === undefined) actPlayer(input.playerAction);
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
  // 阈值见 coeffs.recoverNeiliThreshold；选择器无 params 入参，默认 0.3
  if (
    v.maxNeili > 0 &&
    v.neili / v.maxNeili < DEFAULT_MECHANICS.coeffs.combat.recoverNeiliThreshold
  ) {
    return { type: "recover" };
  }
  return { type: "attack" };
};
