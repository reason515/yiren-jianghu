/** 战术模板编辑草案（对齐 game-core/tactic.ts 契约；结构化、禁脚本）。 */

export type TacticConditionType =
  | "self_qi_below_pct"
  | "self_neili_above_pct"
  | "self_jing_below_pct"
  | "enemy_qi_below_pct"
  | "skill_level_at_least";

export interface TacticConditionDraft {
  id: string;
  type: TacticConditionType;
  /** 百分比阈值或技能等级门槛。 */
  value: number;
  /** skill_level_at_least 时必填。 */
  skillId?: string;
}

export type TacticActionDraft =
  | { kind: "attack" }
  | { kind: "recover" }
  | { kind: "flee" }
  | { kind: "perform"; performId: string };

export interface TacticRuleDraft {
  id: string;
  conditions: TacticConditionDraft[];
  action: TacticActionDraft;
}

export interface TacticTemplateDraft {
  id: string;
  version: number;
  name: string;
  /** 顺序即优先级（自上而下第一条满足的规则生效）。 */
  rules: TacticRuleDraft[];
  defaultAction: TacticActionDraft;
  isDefaultPvp: boolean;
}

export const CONDITION_META: Record<TacticConditionType, { label: string; needsSkillId: boolean }> =
  {
    self_qi_below_pct: { label: "气血低于", needsSkillId: false },
    self_neili_above_pct: { label: "内力高于", needsSkillId: false },
    self_jing_below_pct: { label: "精神低于", needsSkillId: false },
    enemy_qi_below_pct: { label: "敌气血低于", needsSkillId: false },
    skill_level_at_least: { label: "技能等级不低于", needsSkillId: true },
  };

export const ACTION_LABEL: Record<TacticActionDraft["kind"], string> = {
  attack: "普攻",
  recover: "回气",
  flee: "逃跑",
  perform: "绝招",
};

export function createConditionId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createRuleId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
