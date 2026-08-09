import { useEffect, useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import { buildCharacterLook } from "../lib/characterLook.js";
import type { CharacterView, SkillCategory, VitalKey } from "../lib/characterTypes.js";

/** 人物簿四页签：状态 / 武学 / 行囊 / 档案。 */
export type CharacterTab = "body" | "skills" | "bag" | "profile";

/** 人物簿：每一次修习、佩挂与使用都提交服务端，刷新后的快照才是事实。 */
export interface CharacterSheetProps {
  open: boolean;
  character: CharacterView;
  onClose: () => void;
  pendingAction?: string | null;
  onSkillAction?: (action: "practice" | "study", skillId: string) => void;
  onInventoryAction?: (action: "equip" | "unequip" | "use", itemId: string) => void;
  /** 改名：提交受控意图，成功后由上层刷新快照。 */
  onRename?: (name: string) => void;
  /** 放弃角色入口（由上层接 ConfirmSheet 二次确认）。 */
  onDiscard?: () => void;
}

const TAB_OPTIONS: Array<{ value: CharacterTab; label: string }> = [
  { value: "body", label: "状态" },
  { value: "skills", label: "武学" },
  { value: "bag", label: "行囊" },
  { value: "profile", label: "档案" },
];

const ATTR_META: Record<keyof CharacterView["attrs"], { label: string }> = {
  str: { label: "膂力" },
  int: { label: "悟性" },
  con: { label: "根骨" },
  dex: { label: "身法" },
};

const VITAL_META: Record<VitalKey, { label: string; tone: string }> = {
  qi: { label: "气血", tone: "qi" },
  jing: { label: "精神", tone: "jing" },
  jingli: { label: "精力", tone: "jingli" },
  neili: { label: "内力", tone: "neili" },
  food: { label: "饱腹", tone: "food" },
  water: { label: "饮水", tone: "water" },
};

const SKILL_CLASS: Record<SkillCategory, string> = {
  force: "skill-force",
  weapon: "skill-weapon",
  dodge: "skill-dodge",
  parry: "skill-parry",
  knowledge: "skill-knowledge",
};

/** 首版仅兵器 + 衣甲两槽；衣履同属衣甲槽，尚无独立饰品槽（见内容包 kind）。 */
const SLOT_LABEL: Record<"weapon" | "armor", string> = { weapon: "兵器", armor: "衣甲" };
const GENDER_LABEL: Record<CharacterView["gender"], string> = { male: "男", female: "女" };

function masteryClass(level: number, maxLevel: number): string {
  const ratio = maxLevel > 0 ? level / maxLevel : 0;
  if (ratio < 0.15) return "mastery-1";
  if (ratio < 0.35) return "mastery-2";
  if (ratio < 0.55) return "mastery-3";
  if (ratio < 0.75) return "mastery-4";
  if (ratio < 0.95) return "mastery-5";
  return "mastery-6";
}

function pctOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function CharacterSheet({
  open,
  character,
  onClose,
  pendingAction = null,
  onSkillAction,
  onInventoryAction,
  onRename,
  onDiscard,
}: CharacterSheetProps): JSX.Element | null {
  const [tab, setTab] = useState<CharacterTab>("body");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(character.name);

  useEffect(() => {
    setDraftName(character.name);
  }, [character.name]);

  const isPending = (key: string): boolean => pendingAction === key;
  const learnedSkills = character.skills.filter((skill) => skill.level > 0);
  const lookLines = buildCharacterLook(character);

  const itemAction = (item: CharacterView["inventory"][number]) => {
    if (item.equipped) return { action: "unequip" as const, label: "卸下" };
    if (item.kind === "weapon" || item.kind === "armor")
      return { action: "equip" as const, label: "佩上" };
    if (item.kind === "drug" || item.kind === "food")
      return { action: "use" as const, label: "使用" };
    return null;
  };

  const toggleSkill = (skillId: string): void => {
    setExpandedSkillId((prev) => (prev === skillId ? null : skillId));
  };

  const toggleItem = (itemId: string): void => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const switchTab = (next: CharacterTab): void => {
    setTab(next);
    setExpandedSkillId(null);
    setExpandedItemId(null);
  };

  return (
    <Sheet open={open} title={character.name} onClose={onClose}>
      <div className="char-summary" aria-label="历练">
        <span className="res exp">
          <i className="dot" aria-hidden="true" />
          经验 <b className="char-num">{character.exp}</b>
        </span>
        <span className="res pot">
          <i className="dot" aria-hidden="true" />
          可用潜能 <b className="char-num">{character.effectivePotential}</b>
        </span>
        <span className="res silver">
          <i className="dot" aria-hidden="true" />
          银两 <b className="char-num">{character.silver}</b>
        </span>
        {character.masterName || character.sectId ? (
          <span className="res sect">
            师门 <b>{character.masterName ?? character.sectId}</b>
          </span>
        ) : null}
      </div>

      <div className="char-tabs" role="tablist" aria-label="人物簿页签">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            className={tab === option.value ? "on" : undefined}
            onClick={() => switchTab(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="char-tab-panel" data-testid="char-tab-panel">
        {tab === "body" && (
          <>
            <section className="char-section">
              <h4 className="char-section-title">行止</h4>
              <div className="char-vitals" aria-label="当前行止">
                {(Object.keys(VITAL_META) as VitalKey[]).map((key) => {
                  const cur = character.vitals[key];
                  const max = character.vitalsMax[key];
                  const pct = pctOf(cur, max);
                  const low = pct < 30;
                  return (
                    <div
                      className={`char-vital ${VITAL_META[key].tone}${low ? " low" : ""}`}
                      key={key}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={max}
                      aria-valuenow={cur}
                      aria-label={`${VITAL_META[key].label} ${cur}/${max}`}
                    >
                      <div className="char-vital-head">
                        <span>{VITAL_META[key].label}</span>
                        <strong>
                          <span className="char-vital-cur">{cur}</span>
                          <i>/</i>
                          <span className="char-vital-max">{max}</span>
                        </strong>
                      </div>
                      <div className="char-vital-track" aria-hidden="true">
                        <div className="char-vital-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="char-section">
              <h4 className="char-section-title">四维</h4>
              <div className="attr-grid">
                {(Object.keys(ATTR_META) as Array<keyof CharacterView["attrs"]>).map((key) => {
                  const meta = ATTR_META[key];
                  const attr = character.attrs[key];
                  return (
                    <div className="char-attr-row" key={key} data-attr={key}>
                      <span className="char-attr-label">{meta.label}</span>
                      <span className="char-attr-value">
                        当前 <b>{attr.cur}</b> · 先天 <b className="base">{attr.base}</b>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {tab === "skills" && (
          <section className="char-section">
            <h4 className="char-section-title">武功</h4>
            {learnedSkills.length === 0 ? (
              <p className="char-empty">你尚未学会任何武功。去村中武馆当面请教吧。</p>
            ) : (
              learnedSkills.map((skill) => {
                const expanded = expandedSkillId === skill.id;
                return (
                  <div
                    className={`char-skill-row${expanded ? " open" : ""}`}
                    key={skill.id}
                    data-testid={`skill-row-${skill.id}`}
                  >
                    <button
                      type="button"
                      className="char-skill-toggle"
                      aria-expanded={expanded}
                      onClick={() => toggleSkill(skill.id)}
                    >
                      <span className={`char-skill-name ${SKILL_CLASS[skill.category]}`}>
                        {skill.name}
                      </span>
                      <em
                        className={`char-skill-level ${masteryClass(skill.level, skill.maxLevel)}`}
                      >
                        Lv {skill.level}
                      </em>
                      <span className="char-skill-points">演练点 {skill.practicePoints}</span>
                      <i className="char-skill-bar">
                        <b
                          style={{
                            width: `${skill.maxLevel > 0 ? Math.min(100, (skill.level / skill.maxLevel) * 100) : 0}%`,
                          }}
                        />
                      </i>
                    </button>
                    {expanded && (
                      <div className="char-skill-detail">
                        {skill.description ? (
                          <p className="char-skill-desc">{skill.description}</p>
                        ) : null}
                        {onSkillAction && (
                          <div className="char-row-actions">
                            <p className="char-skill-hint">
                              请教须当面寻师父；此处可自行演练、参悟。
                            </p>
                            {(["practice", "study"] as const).map((action) => {
                              const label = action === "practice" ? "演练" : "参悟";
                              const key = `skill:${action}:${skill.id}`;
                              return (
                                <Chip
                                  key={action}
                                  label={isPending(key) ? "行功中…" : label}
                                  variant="action"
                                  disabled={Boolean(pendingAction)}
                                  onClick={() => onSkillAction(action, skill.id)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        )}

        {tab === "bag" && (
          <>
            <section className="char-section">
              <h4 className="char-section-title">当前佩挂</h4>
              {character.equipment.map((slot) => (
                <div className="char-equip-row" key={slot.slot}>
                  <span className="char-equip-slot">{SLOT_LABEL[slot.slot]}</span>
                  <span className="char-equip-item">{slot.item?.name ?? "空"}</span>
                  {slot.item && onInventoryAction && (
                    <Chip
                      label={isPending(`item:unequip:${slot.item.id}`) ? "卸下中…" : "卸下"}
                      variant="action"
                      disabled={Boolean(pendingAction)}
                      onClick={() => onInventoryAction("unequip", slot.item!.id)}
                    />
                  )}
                </div>
              ))}
            </section>

            <section className="char-section">
              <h4 className="char-section-title">行囊</h4>
              {character.inventory.length === 0 ? (
                <p className="char-empty">行囊空空如也。</p>
              ) : (
                character.inventory.map((item) => {
                  const action = itemAction(item);
                  const key = action ? `item:${action.action}:${item.id}` : "";
                  const expanded = expandedItemId === item.id;
                  return (
                    <div
                      className={`char-inv-row${expanded ? " open" : ""}`}
                      key={item.id}
                      data-testid={`inv-row-${item.id}`}
                    >
                      <button
                        type="button"
                        className="char-inv-toggle"
                        aria-expanded={expanded}
                        onClick={() => toggleItem(item.id)}
                      >
                        <span className={`char-inv-name item-${item.kind}`}>
                          {item.name}
                          {item.equipped ? "（已佩）" : ""}
                        </span>
                        <span className="char-inv-qty">×{item.quantity}</span>
                      </button>
                      {expanded && action && onInventoryAction && (
                        <div className="char-row-actions">
                          <Chip
                            label={isPending(key) ? "行事中…" : action.label}
                            variant="action"
                            disabled={Boolean(pendingAction)}
                            onClick={() => onInventoryAction(action.action, item.id)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}

        {tab === "profile" && (
          <section className="char-section">
            <h4 className="char-section-title">仪容</h4>
            <div className="char-look" aria-label="仪容">
              {lookLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <h4 className="char-section-title">档案</h4>
            <div className="char-profile-line">
              <span>名号</span>
              <strong>{character.name}</strong>
            </div>
            <div className="char-profile-line">
              <span>性别</span>
              <strong>{GENDER_LABEL[character.gender]}</strong>
            </div>
            {onRename && (
              <div className="char-rename">
                <label className="char-rename-label" htmlFor="char-rename-input">
                  改名
                </label>
                <input
                  id="char-rename-input"
                  className="char-rename-input"
                  type="text"
                  value={draftName}
                  maxLength={8}
                  disabled={Boolean(pendingAction)}
                  onChange={(e) => setDraftName(e.target.value)}
                />
                <Chip
                  label={isPending("rename") ? "更名中…" : "更名"}
                  variant="action"
                  disabled={
                    Boolean(pendingAction) ||
                    draftName.trim() === "" ||
                    draftName.trim() === character.name
                  }
                  onClick={() => onRename(draftName.trim())}
                />
              </div>
            )}
            {onDiscard && (
              <div className="char-footer">
                <Chip label="放弃角色" variant="danger" onClick={onDiscard} />
              </div>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
