import type { JSX } from "react";
import { Chip } from "./base/Chip.js";
import {
  ACTION_LABEL,
  CONDITION_META,
  createConditionId,
  createRuleId,
  type TacticActionDraft,
  type TacticConditionDraft,
  type TacticConditionType,
  type TacticRuleDraft,
  type TacticTemplateDraft,
} from "../lib/tacticTypes.js";

/**
 * 战术模板编辑器（mobile-ui：结构化表单、禁原生 select、禁脚本；对应 game-core/tactic.ts 契约）。
 */
export interface TacticEditorProps {
  templates: TacticTemplateDraft[];
  activeId: string | null;
  /** 玩家已学会的绝招（perform 动作候选）。 */
  performs: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onChange: (template: TacticTemplateDraft) => void;
  onAddTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
}

const CONDITION_TYPES = Object.keys(CONDITION_META) as TacticConditionType[];
const ACTION_KINDS: TacticActionDraft["kind"][] = ["attack", "recover", "flee", "perform"];

function toAction(kind: TacticActionDraft["kind"]): TacticActionDraft {
  return kind === "perform" ? { kind: "perform", performId: "" } : { kind };
}

export function TacticEditor({
  templates,
  activeId,
  performs,
  onSelect,
  onChange,
  onAddTemplate,
  onDeleteTemplate,
}: TacticEditorProps): JSX.Element {
  const active = templates.find((t) => t.id === activeId) ?? null;

  return (
    <div className="tactic-editor" data-testid="tactic-editor">
      <div className="tactic-list">
        {templates.map((t) => (
          <div className="tactic-list-row" key={t.id}>
            <button
              type="button"
              className={`tactic-name${t.id === activeId ? " on" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              {t.name}
              {t.isDefaultPvp ? "（论剑默认）" : ""}
            </button>
            <button
              type="button"
              className="tactic-delete"
              aria-label={`删除 ${t.name}`}
              onClick={() => onDeleteTemplate(t.id)}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="tactic-add" onClick={onAddTemplate}>
          新建模板
        </button>
      </div>

      {active && (
        <div className="tactic-detail" data-testid="tactic-detail">
          <RuleList template={active} performs={performs} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function RuleList({
  template,
  performs,
  onChange,
}: {
  template: TacticTemplateDraft;
  performs: { id: string; name: string }[];
  onChange: (t: TacticTemplateDraft) => void;
}): JSX.Element {
  const rules = template.rules;
  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange({ ...template, rules: next });
  };
  const patchRule = (index: number, rule: TacticRuleDraft): void => {
    const next = [...rules];
    next[index] = rule;
    onChange({ ...template, rules: next });
  };
  const removeRule = (index: number): void => {
    onChange({ ...template, rules: rules.filter((_, i) => i !== index) });
  };

  const warnings = rules.some((r) => r.conditions.length === 0)
    ? "有无条件规则，其后的规则永远不会被触发（建议置顶为兜底）。"
    : null;

  return (
    <div className="tactic-rules">
      {warnings && (
        <p className="tactic-warning" data-testid="tactic-warning">
          {warnings}
        </p>
      )}
      {rules.length === 0 && <p className="tactic-empty">尚无规则，将始终执行兜底动作。</p>}
      {rules.map((rule, index) => (
        <RuleRow
          key={rule.id}
          index={index}
          rule={rule}
          performs={performs}
          canMoveUp={index > 0}
          canMoveDown={index < rules.length - 1}
          onPatch={(r) => patchRule(index, r)}
          onMove={(d) => move(index, d)}
          onRemove={() => removeRule(index)}
        />
      ))}
      <button
        type="button"
        className="tactic-btn"
        onClick={() =>
          onChange({
            ...template,
            rules: [...rules, { id: createRuleId(), conditions: [], action: { kind: "attack" } }],
          })
        }
      >
        添加规则
      </button>
      <DefaultActionRow template={template} onChange={onChange} />
    </div>
  );
}

function RuleRow({
  index,
  rule,
  performs,
  canMoveUp,
  canMoveDown,
  onPatch,
  onMove,
  onRemove,
}: {
  index: number;
  rule: TacticRuleDraft;
  performs: { id: string; name: string }[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (r: TacticRuleDraft) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}): JSX.Element {
  const addCondition = (type: TacticConditionType): void => {
    onPatch({
      ...rule,
      conditions: [...rule.conditions, { id: createConditionId(), type, value: 50 }],
    });
  };
  const patchCondition = (id: string, patch: Partial<TacticConditionDraft>): void => {
    onPatch({
      ...rule,
      conditions: rule.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };
  const removeCondition = (id: string): void => {
    onPatch({ ...rule, conditions: rule.conditions.filter((c) => c.id !== id) });
  };
  const patchAction = (action: TacticActionDraft): void => {
    onPatch({ ...rule, action });
  };

  return (
    <div className="tactic-rule" data-testid="tactic-rule">
      <div className="tactic-rule-head">
        <span className="tactic-rule-no">规则 {index + 1}</span>
        <div className="tactic-rule-ops">
          <button type="button" aria-label="上移" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="下移" disabled={!canMoveDown} onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" aria-label="删除规则" onClick={onRemove}>
            ×
          </button>
        </div>
      </div>

      <div className="tactic-cond-list">
        {rule.conditions.map((c) => (
          <div className="tactic-cond" key={c.id}>
            <span className="tactic-cond-label">{CONDITION_META[c.type].label}</span>
            <input
              className="tactic-input num"
              type="number"
              aria-label={`${CONDITION_META[c.type].label}数值`}
              value={c.value}
              onChange={(e) => patchCondition(c.id, { value: Number(e.target.value) })}
            />
            {c.type === "skill_level_at_least" && (
              <input
                className="tactic-input"
                aria-label="技能 id"
                value={c.skillId ?? ""}
                placeholder="技能"
                onChange={(e) => patchCondition(c.id, { skillId: e.target.value })}
              />
            )}
            <button type="button" aria-label="删除条件" onClick={() => removeCondition(c.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="tactic-cond-add" role="group" aria-label="添加条件">
        {CONDITION_TYPES.map((t) => (
          <button key={t} type="button" className="tactic-chip" onClick={() => addCondition(t)}>
            {CONDITION_META[t].label}
          </button>
        ))}
      </div>

      <div className="tactic-action" role="group" aria-label="动作">
        {ACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`tactic-chip${rule.action.kind === kind ? " on" : ""}`}
            onClick={() => patchAction(toAction(kind))}
          >
            {ACTION_LABEL[kind]}
          </button>
        ))}
        {rule.action.kind === "perform" && (
          <div className="tactic-perform-list" role="group" aria-label="选择绝招">
            {performs.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tactic-chip${rule.action.kind === "perform" && rule.action.performId === p.id ? " on" : ""}`}
                onClick={() => patchAction({ kind: "perform", performId: p.id })}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultActionRow({
  template,
  onChange,
}: {
  template: TacticTemplateDraft;
  onChange: (t: TacticTemplateDraft) => void;
}): JSX.Element {
  return (
    <div className="tactic-default">
      <span className="tactic-default-label">兜底动作</span>
      {ACTION_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`tactic-chip${template.defaultAction.kind === kind ? " on" : ""}`}
          onClick={() => onChange({ ...template, defaultAction: toAction(kind) })}
        >
          {ACTION_LABEL[kind]}
        </button>
      ))}
      <label className="tactic-pvp">
        <input
          type="checkbox"
          checked={template.isDefaultPvp}
          onChange={(e) => onChange({ ...template, isDefaultPvp: e.target.checked })}
        />
        作为论剑默认模板
      </label>
    </div>
  );
}
