import { z } from "zod";
import type { Perform } from "@yjh/content";
import type {
  ActionSelector,
  ActorKey,
  BattleAction,
  BattleContext,
  CombatantView,
} from "./combat.js";
import {
  canUsePerform,
  createPerformCooldownTracker,
  performToBattleAction,
  type PerformCooldownTracker,
} from "./perform.js";

/**
 * C6 战术模板引擎（服务端权威）。
 *
 * 模板 = 有序规则列表（自上而下即优先级）+ 兜底动作。挂机（C7）与 PVP（C8）共用同一评估器。
 * - 条件：受控枚举（气血/精神/内力百分比、敌方气血、技能等级门槛），不开放脚本/正则；
 * - 动作：attack / recover / flee / perform（引用内容包绝招）；
 * - 绝招由 canUsePerform 校验（条件/消耗/冷却），不满足则落入下一条规则；
 * - 快照语义：模板带 version，挂机/PVP 开始时固化。
 */

// ---------- Schema（zod，玩家模板的唯一契约） ----------

export const tacticConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("self_qi_below_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("self_qi_above_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("self_neili_below_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("self_neili_above_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("self_jing_below_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("enemy_qi_below_pct"), value: z.number().min(0).max(100) }),
  z.object({
    type: z.literal("skill_level_at_least"),
    skillId: z.string().min(1),
    value: z.number().int().min(0),
  }),
]);

export const tacticActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attack") }),
  z.object({ type: z.literal("recover") }),
  z.object({ type: z.literal("flee") }),
  z.object({ type: z.literal("perform"), performId: z.string().min(1) }),
]);

export const tacticRuleSchema = z.object({
  id: z.string().min(1),
  conditions: z.array(tacticConditionSchema).default([]),
  action: tacticActionSchema,
});

export const tacticTemplateSchema = z.object({
  version: z.number().int().nonnegative(),
  rules: z.array(tacticRuleSchema),
  defaultAction: tacticActionSchema.default({ type: "attack" }),
});

export type TacticCondition = z.infer<typeof tacticConditionSchema>;
export type TacticAction = z.infer<typeof tacticActionSchema>;
export type TacticRule = z.infer<typeof tacticRuleSchema>;
export type TacticTemplate = z.infer<typeof tacticTemplateSchema>;

// ---------- 条件评估 ----------

export interface ConditionContext {
  self: CombatantView;
  foe: CombatantView;
  skillLevels: Map<string, number>;
}

function pct(cur: number, max: number): number {
  return (cur / Math.max(1, max)) * 100;
}

export function evaluateConditions(conditions: TacticCondition[], ctx: ConditionContext): boolean {
  for (const c of conditions) {
    switch (c.type) {
      case "self_qi_below_pct":
        if (!(pct(ctx.self.qi, ctx.self.maxQi) < c.value)) return false;
        break;
      case "self_qi_above_pct":
        if (!(pct(ctx.self.qi, ctx.self.maxQi) >= c.value)) return false;
        break;
      case "self_neili_below_pct":
        if (!(pct(ctx.self.neili, ctx.self.maxNeili) < c.value)) return false;
        break;
      case "self_neili_above_pct":
        if (!(pct(ctx.self.neili, ctx.self.maxNeili) >= c.value)) return false;
        break;
      case "self_jing_below_pct":
        if (!(pct(ctx.self.jing, ctx.self.maxJing) < c.value)) return false;
        break;
      case "enemy_qi_below_pct":
        if (!(pct(ctx.foe.qi, ctx.foe.maxQi) < c.value)) return false;
        break;
      case "skill_level_at_least":
        if ((ctx.skillLevels.get(c.skillId) ?? 0) < c.value) return false;
        break;
    }
  }
  return true;
}

// ---------- 评估器（模板 → 战斗动作） ----------

export interface TacticDeps {
  /** 绝招定义（内容包）。 */
  performs: Map<string, Perform>;
  /** 角色技能等级（skillId → level）。 */
  skillLevels: Map<string, number>;
}

interface ResolveContext {
  battle: BattleContext;
  actor: ActorKey;
  deps: TacticDeps;
  cooldown: PerformCooldownTracker;
}

function resolveAction(action: TacticAction, ctx: ResolveContext): BattleAction | null {
  switch (action.type) {
    case "attack":
      return { type: "attack" };
    case "recover":
      return { type: "recover" };
    case "flee":
      return { type: "flee" };
    case "perform": {
      const perform = ctx.deps.performs.get(action.performId);
      if (!perform) return null;
      const canUse = canUsePerform(
        perform,
        {
          battle: ctx.battle,
          actor: ctx.actor,
          skillLevel: ctx.deps.skillLevels.get(perform.skillId) ?? 0,
        },
        ctx.battle.turn,
        ctx.cooldown,
      );
      if (!canUse.ok) return null;
      const battleAction = performToBattleAction(perform);
      if (!battleAction) return null;
      ctx.cooldown.markUsed(perform, ctx.battle.turn);
      return battleAction;
    }
  }
}

/** 模板 → 战斗选择器（挂机 C7 与 PVP C8 共用）。冷却跟踪随战斗实例。 */
export function createTacticSelector(template: TacticTemplate, deps: TacticDeps): ActionSelector {
  const cooldown = createPerformCooldownTracker();
  return (battle: BattleContext, actor: ActorKey): BattleAction => {
    const self = battle.get(actor);
    const foe = battle.get(actor === "a" ? "b" : "a");
    const condCtx: ConditionContext = { self, foe, skillLevels: deps.skillLevels };
    const resolveCtx: ResolveContext = { battle, actor, deps, cooldown };

    for (const rule of template.rules) {
      if (!evaluateConditions(rule.conditions, condCtx)) continue;
      const action = resolveAction(rule.action, resolveCtx);
      if (action) return action;
    }
    return resolveAction(template.defaultAction, resolveCtx) ?? { type: "attack" };
  };
}

// ---------- 语义校验器（服务端拒绝非法模板） ----------

export interface TacticIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export function validateTacticTemplate(template: TacticTemplate, deps: TacticDeps): TacticIssue[] {
  const issues: TacticIssue[] = [];

  if (template.rules.length === 0) {
    issues.push({
      code: "no_rules",
      severity: "warning",
      message: "模板没有任何规则，将始终执行兜底动作",
    });
  }

  const ruleIds = new Set<string>();
  for (let i = 0; i < template.rules.length; i++) {
    const rule = template.rules[i]!;
    if (ruleIds.has(rule.id)) {
      issues.push({
        code: "duplicate_rule_id",
        severity: "error",
        message: `规则 id 重复：${rule.id}`,
      });
    }
    ruleIds.add(rule.id);

    for (const c of rule.conditions) {
      if (c.type === "skill_level_at_least" && !deps.skillLevels.has(c.skillId)) {
        issues.push({
          code: "unknown_skill",
          severity: "error",
          message: `规则 ${rule.id} 引用未知技能 ${c.skillId}`,
        });
      }
    }

    if (rule.action.type === "perform") {
      const perform = deps.performs.get(rule.action.performId);
      if (!perform) {
        issues.push({
          code: "unknown_perform",
          severity: "error",
          message: `规则 ${rule.id} 引用未知绝招 ${rule.action.performId}`,
        });
      } else if (perform.effect.type === "buff") {
        issues.push({
          code: "perform_buff_unsupported",
          severity: "warning",
          message: `规则 ${rule.id} 使用 buff 绝招 ${perform.id}，v1 引擎未实现`,
        });
      }
    }

    // 无条件规则之后的规则永远不可达（遮蔽）
    if (rule.conditions.length === 0) {
      for (let j = i + 1; j < template.rules.length; j++) {
        issues.push({
          code: "shadowed_rule",
          severity: "warning",
          message: `规则 ${template.rules[j]!.id} 被无条件规则 ${rule.id} 遮蔽，永远不可达`,
        });
      }
    }
  }

  return issues;
}
