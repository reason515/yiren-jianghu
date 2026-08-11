import { evalFormulaWithCoeffs, type CompiledMechanics, type Perform } from "@yjh/content";
import type { ActionSelector, ActorKey, BattleAction, BattleContext } from "./combat.js";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS, type GameParams } from "./params.js";

/**
 * C4 绝招定义与执行。
 *
 * - 绝招定义来自内容包（performSchema），本模块负责条件评估、消耗/冷却校验，
 *   并把绝招映射为战斗引擎的 BattleAction（perform 动作）。
 * - 条件枚举（受控，不开放脚本）：self_qi_below_pct / self_neili_above_pct /
 *   skill_level_at_least / enemy_qi_below_pct。
 * - buff 类绝招 v1 未实现（Schema 保留，校验器 warning）。
 * - 冷却按回合计（cooldownTurns）。
 */

export interface PerformEvalContext {
  battle: BattleContext;
  actor: ActorKey;
  /** 绝招所属技能的有效等级（由角色提供，C5 接入技能成长）。 */
  skillLevel: number;
}

/** 返回 null 表示条件满足，否则返回原因描述。 */
export function evaluatePerformConditions(p: Perform, ctx: PerformEvalContext): string | null {
  const self = ctx.battle.get(ctx.actor);
  const foe = ctx.battle.get(ctx.actor === "a" ? "b" : "a");
  for (const cond of p.conditions) {
    switch (cond.type) {
      case "self_qi_below_pct": {
        const pct = (self.qi / Math.max(1, self.maxQi)) * 100;
        if (!(pct < cond.value)) return `self_qi_below_pct 未满足（当前 ${pct.toFixed(1)}%）`;
        break;
      }
      case "self_neili_above_pct": {
        const pct = (self.neili / Math.max(1, self.maxNeili)) * 100;
        if (!(pct >= cond.value)) return `self_neili_above_pct 未满足（当前 ${pct.toFixed(1)}%）`;
        break;
      }
      case "skill_level_at_least": {
        if (ctx.skillLevel < cond.value)
          return `skill_level_at_least 未满足（技能等级 ${ctx.skillLevel}）`;
        break;
      }
      case "enemy_qi_below_pct": {
        const pct = (foe.qi / Math.max(1, foe.maxQi)) * 100;
        if (!(pct < cond.value)) return `enemy_qi_below_pct 未满足（敌方 ${pct.toFixed(1)}%）`;
        break;
      }
    }
  }
  return null;
}

export type PerformUseReason = "condition" | "cost" | "cooldown";

export interface CanUsePerformResult {
  ok: boolean;
  reason?: PerformUseReason;
  detail?: string;
}

/** 综合校验：条件 + 消耗 + 冷却（战斗引擎还会做最终消耗兜底）。 */
export function canUsePerform(
  p: Perform,
  ctx: PerformEvalContext,
  turn: number,
  cooldown: PerformCooldownTracker,
): CanUsePerformResult {
  const condition = evaluatePerformConditions(p, ctx);
  if (condition !== null) return { ok: false, reason: "condition", detail: condition };
  const self = ctx.battle.get(ctx.actor);
  if (self.neili < p.cost.neili || self.jing < p.cost.jing || self.qi < p.cost.qi) {
    return { ok: false, reason: "cost", detail: "消耗不足" };
  }
  if (!cooldown.canUse(p, turn)) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

/**
 * 绝招按所属技能原级放大效果量（公式 scalePerformAmount）。
 */
export function scalePerformAmount(
  amount: number,
  skillRawLevel: number,
  params: GameParams = DEFAULT_PARAMS,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return evalFormulaWithCoeffs(mechanics, params, "scalePerformAmount", {
    amount,
    skillRawLevel,
  });
}

/** 绝招 → 战斗动作（DC-048：含 heal/cure/buff）。skillRawLevel 用于按等级放大效果量。 */
export function performToBattleAction(p: Perform, skillRawLevel = 0): BattleAction | null {
  const cost = {
    qi: p.cost.qi || undefined,
    jing: p.cost.jing || undefined,
    neili: p.cost.neili || undefined,
  };
  if (p.effect.type === "damage") {
    return {
      type: "perform",
      performId: p.id,
      cost,
      effect: {
        kind: "damage",
        type: "physical",
        flat: scalePerformAmount(p.effect.amount, skillRawLevel),
      },
    };
  }
  if (p.effect.type === "heal") {
    // 约定：target=self 且 description 含疗伤语义时用 cure；否则普通回气。
    // Schema 无独立 cure 类型时：amount 走 heal，另用 effect.target + 命名约定。
    // DC-048：新增 content 用 effect.type=heal + 特殊 id 前缀 cure_ 表示疗伤。
    if (p.id.startsWith("cure_") || p.name.includes("疗伤")) {
      return {
        type: "perform",
        performId: p.id,
        cost,
        effect: { kind: "cure", flat: scalePerformAmount(p.effect.amount, skillRawLevel) },
      };
    }
    return {
      type: "perform",
      performId: p.id,
      cost,
      effect: { kind: "heal", flat: scalePerformAmount(p.effect.amount, skillRawLevel) },
    };
  }
  // heal_jing 仅场外运功（DC-052）；战斗内不映射。
  if (p.effect.type === "heal_jing") {
    return null;
  }
  if (p.effect.type === "buff") {
    return {
      type: "perform",
      performId: p.id,
      cost,
      effect: {
        kind: "buff",
        flat: scalePerformAmount(p.effect.amount, skillRawLevel),
        durationTurns: Math.max(1, p.cooldownTurns),
      },
    };
  }
  return null;
}

/** 冷却跟踪（按回合）。 */
export interface PerformCooldownTracker {
  canUse(p: Perform, turn: number): boolean;
  markUsed(p: Perform, turn: number): void;
}

export function createPerformCooldownTracker(): PerformCooldownTracker {
  const lastUsed = new Map<string, number>();
  return {
    canUse(p, turn) {
      const last = lastUsed.get(p.id);
      if (last === undefined) return true;
      return turn - last >= p.cooldownTurns;
    },
    markUsed(p, turn) {
      lastUsed.set(p.id, turn);
    },
  };
}

/** 测试/占位选择器：按优先级取第一个可用绝招，否则普通攻击（C6 模板选择器在此基础上构建）。 */
export function performSelector(
  performs: Perform[],
  skillLevels: Map<string, number>,
): ActionSelector {
  const cooldown = createPerformCooldownTracker();
  return (ctx, actor) => {
    const turn = ctx.turn;
    for (const p of performs) {
      const skillLevel = skillLevels.get(p.skillId) ?? 0;
      const check = canUsePerform(p, { battle: ctx, actor, skillLevel }, turn, cooldown);
      if (!check.ok) continue;
      const action = performToBattleAction(p, skillLevel);
      if (action === null) continue;
      cooldown.markUsed(p, turn);
      return action;
    }
    return { type: "attack" };
  };
}
