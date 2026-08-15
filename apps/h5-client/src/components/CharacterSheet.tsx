import { useEffect, useState, type JSX } from "react";
import { skillMastery } from "@yjh/game-core/skillMastery";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import { buildCharacterLook } from "../lib/characterLook.js";
import {
  ENABLE_SLOT_LABEL,
  ENABLE_SLOT_ORDER,
  type CharacterView,
  type EnableSlot,
  type SkillRowView,
  type VitalKey,
} from "../lib/characterTypes.js";
import { fieldExertKindLabel, formatExertCost, toFieldExertOptions } from "../lib/fieldExert.js";

/** 人物簿四页签：状态 / 武学 / 行囊 / 档案。 */
export type CharacterTab = "body" | "skills" | "bag" | "profile";

/** 武学二级页签（DC-057）：临敌 / 特殊功 / 基本功。 */
type SkillsSubTab = "combat" | "special" | "basic";

/** 人物簿：每一次修习、佩挂与使用都提交服务端，刷新后的快照才是事实。 */
export interface CharacterSheetProps {
  open: boolean;
  character: CharacterView;
  onClose: () => void;
  pendingAction?: string | null;
  onSkillAction?: (action: "practice" | "study", skillId: string) => void;
  /** DC-041：激发槽 → 特殊功；null 清空。 */
  onEnableSkill?: (slot: EnableSlot, skillId: string | null) => void;
  onInventoryAction?: (action: "equip" | "unequip" | "use", itemId: string) => void;
  /** 改名：提交受控意图，成功后由上层刷新快照。 */
  onRename?: (name: string) => void;
  /** 放弃角色入口（由上层接 ConfirmSheet 二次确认）。 */
  onDiscard?: () => void;
  /** 场外运功（DC-052）：状态页按已学自疗绝招显示对应按钮。 */
  onExertPerform?: (performId: string) => void;
}

const TAB_OPTIONS: Array<{ value: CharacterTab; label: string }> = [
  { value: "body", label: "状态" },
  { value: "skills", label: "武学" },
  { value: "bag", label: "行囊" },
  { value: "profile", label: "档案" },
];

const SKILLS_SUB_TABS: Array<{ value: SkillsSubTab; label: string }> = [
  { value: "combat", label: "临敌" },
  { value: "special", label: "特殊功" },
  { value: "basic", label: "基本功" },
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
};

/** 首版仅兵器 + 衣甲两槽；衣履同属衣甲槽，尚无独立饰品槽（见内容包 kind）。 */
const SLOT_LABEL: Record<"weapon" | "armor", string> = { weapon: "兵器", armor: "衣甲" };
const GENDER_LABEL: Record<CharacterView["gender"], string> = { male: "男", female: "女" };
const ITEM_STAT_LABEL: Record<
  keyof NonNullable<CharacterView["inventory"][number]["stats"]>,
  string
> = {
  attack: "攻击",
  defense: "防御",
  dodge: "闪避",
  parry: "招架",
};
const ITEM_USE_LABEL: Record<
  NonNullable<CharacterView["inventory"][number]["usable"]>["effect"],
  string
> = {
  heal_qi: "恢复气血",
  heal_jing: "恢复精神",
  restore_neili: "恢复内力",
  cure_qi: "疗伤",
};

function pctOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

function masteryOf(skill: SkillRowView) {
  return skillMastery(skill.level, skill.category === "knowledge" ? "knowledge" : "martial");
}

export function CharacterSheet({
  open,
  character,
  onClose,
  pendingAction = null,
  onSkillAction,
  onEnableSkill,
  onInventoryAction,
  onRename,
  onDiscard,
  onExertPerform,
}: CharacterSheetProps): JSX.Element | null {
  const [tab, setTab] = useState<CharacterTab>("body");
  const [skillsSubTab, setSkillsSubTab] = useState<SkillsSubTab>("combat");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(character.name);

  useEffect(() => {
    setDraftName(character.name);
  }, [character.name]);

  const isPending = (key: string): boolean => pendingAction === key;
  const learnedSkills = character.skills.filter((skill) => skill.level > 0);
  const moves = character.moves ?? [];
  const performs = character.performs ?? [];
  const fieldExertOptions = toFieldExertOptions(performs);
  const skillEnable = character.skillEnable ?? {};
  const effective = character.effective ?? {};
  const lookLines = buildCharacterLook(character);
  const enabledSkillIds = new Set(
    Object.values(skillEnable).filter((id): id is string => Boolean(id)),
  );

  const skillName = (id: string | null | undefined): string => {
    if (!id) return "未激发";
    return character.skills.find((s) => s.id === id)?.name ?? id;
  };

  const combatSlots = ENABLE_SLOT_ORDER.filter((slot) => {
    const hasBasic = learnedSkills.some((s) => s.kind === "basic" && s.category === slot);
    return hasBasic || Boolean(skillEnable[slot]);
  });

  const specialEnabled = learnedSkills.filter(
    (s) => s.kind === "special" && enabledSkillIds.has(s.id),
  );
  const specialOther = learnedSkills.filter(
    (s) => s.kind === "special" && !enabledSkillIds.has(s.id),
  );
  const specialSkills = [...specialEnabled, ...specialOther];
  const basicSkills = learnedSkills.filter((s) => s.kind === "basic" && s.category !== "knowledge");
  const knowledgeSkills = learnedSkills.filter((s) => s.category === "knowledge");

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

  const switchSkillsSubTab = (next: SkillsSubTab): void => {
    setSkillsSubTab(next);
    setExpandedSkillId(null);
  };

  const renderSkillRow = (skill: SkillRowView): JSX.Element => {
    const expanded = expandedSkillId === skill.id;
    const inUse = enabledSkillIds.has(skill.id);
    const skillMoves = moves.filter((move) => move.skillId === skill.id);
    const skillPerforms = performs.filter((pf) => pf.skillId === skill.id);
    const mastery = masteryOf(skill);
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
          <span className={`char-skill-name${inUse ? " eq" : ""}`}>
            {inUse ? "□" : ""}
            {skill.name}
          </span>
          <em className={`char-skill-mastery mastery-${mastery.band}`}>{mastery.label}</em>
          <b className="char-skill-level">{skill.level}</b>
        </button>
        {expanded && (
          <div className="char-skill-detail">
            {skill.description ? <p className="char-skill-desc">{skill.description}</p> : null}
            <p className="char-skill-points">演练点 {skill.practicePoints}</p>
            {skillMoves.length > 0 ? (
              <ul className="char-move-list">
                {skillMoves.map((move) => (
                  <li key={move.id}>
                    <span>{move.name}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {skillPerforms.length > 0 ? (
              <ul className="char-move-list">
                {skillPerforms.map((pf) => (
                  <li key={pf.id}>
                    <span>{pf.name}</span>
                    {pf.fieldKind && onExertPerform ? (
                      <Chip
                        label={isPending(`exert:${pf.id}`) ? "运功中…" : "运功"}
                        variant="perform"
                        disabled={Boolean(pendingAction)}
                        onClick={() => onExertPerform(pf.id)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="char-row-actions">
              {skill.kind === "special" && onEnableSkill
                ? skill.enableSlots.map((slot) => {
                    const active = skillEnable[slot] === skill.id;
                    const key = `enable:${slot}`;
                    return (
                      <Chip
                        key={slot}
                        label={
                          isPending(key)
                            ? "行功中…"
                            : active
                              ? "卸下"
                              : `激发为${ENABLE_SLOT_LABEL[slot]}`
                        }
                        variant="action"
                        disabled={Boolean(pendingAction)}
                        onClick={() => onEnableSkill(slot, active ? null : skill.id)}
                      />
                    );
                  })
                : null}
              {skill.kind === "basic" ? (
                <p className="char-skill-hint">请教须当面寻师父；此处可自行演练、参悟。</p>
              ) : null}
              {onSkillAction
                ? (["practice", "study"] as const).map((action) => {
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
                  })
                : null}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} title={character.name} onClose={onClose}>
      <div className="char-summary" aria-label="历练">
        <span className="res exp">
          <i className="dot" aria-hidden="true" />
          历练 <b className="char-num">{character.exp}</b>
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
            师门{" "}
            <b>
              {character.masterName ?? character.sectId}
              {character.generation != null ? ` · 第${character.generation}代` : ""}
            </b>
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
            <section className="char-section char-vitals-section">
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

            {fieldExertOptions.length > 0 ? (
              <section className="char-section" data-testid="char-exert">
                <h4 className="char-section-title">运功</h4>
                <div className="char-exert-list">
                  {fieldExertOptions.map((opt) => (
                    <div
                      className="char-exert-row"
                      key={opt.id}
                      data-testid={`char-exert-${opt.id}`}
                    >
                      <Chip
                        label={isPending(`exert:${opt.id}`) ? `${opt.name}…` : opt.name}
                        variant="perform"
                        disabled={Boolean(pendingAction) || !onExertPerform}
                        onClick={() => onExertPerform?.(opt.id)}
                      />
                      <em className="char-exert-kind">{fieldExertKindLabel(opt.kind)}</em>
                      <span className="char-exert-cost">{formatExertCost(opt.cost)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="char-section char-attrs-section">
              <table className="char-attr-table" aria-label="人物属性">
                <thead>
                  <tr>
                    <th scope="col">属性</th>
                    <th scope="col">当前</th>
                    <th scope="col">先天</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(ATTR_META) as Array<keyof CharacterView["attrs"]>).map((key) => {
                    const meta = ATTR_META[key];
                    const attr = character.attrs[key];
                    return (
                      <tr key={key} data-attr={key}>
                        <th scope="row">{meta.label}</th>
                        <td>{attr.cur}</td>
                        <td>{attr.base}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="char-section" data-testid="char-combat-stats">
              <h4 className="char-section-title">临敌数值</h4>
              <div className="char-combat-stats">
                <div>
                  <span>攻击</span>
                  <b>{character.combat?.attack ?? 0}</b>
                </div>
                <div>
                  <span>防御</span>
                  <b>{character.combat?.defense ?? 0}</b>
                </div>
              </div>
              <ul className="char-combat-hints" aria-label="攻防计算说明">
                <li>
                  <b>攻击</b>
                  <span>当前膂力＋当前所用武学等级（兵器或拳脚）＋装备攻击</span>
                </li>
                <li>
                  <b>防御</b>
                  <span>基础 8＋当前根骨＋衣甲防御</span>
                </li>
              </ul>
            </section>
          </>
        )}

        {tab === "skills" && (
          <>
            <div className="char-skills-tabs" role="tablist" aria-label="武学分类">
              {SKILLS_SUB_TABS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={skillsSubTab === option.value}
                  className={skillsSubTab === option.value ? "on" : undefined}
                  onClick={() => switchSkillsSubTab(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {skillsSubTab === "combat" && (
              <section className="char-section" data-testid="char-combat">
                {combatSlots.length === 0 ? (
                  <p className="char-empty">尚未学会武功。去村中武馆当面请教。</p>
                ) : (
                  combatSlots.map((slot) => {
                    const current = skillEnable[slot] ?? null;
                    const name = skillName(current);
                    return (
                      <div className="char-combat-row" key={slot} data-testid={`combat-${slot}`}>
                        <span className="char-combat-slot">{ENABLE_SLOT_LABEL[slot]}</span>
                        <span className={`char-combat-name${current ? "" : " empty"}`}>{name}</span>
                        <b className="char-combat-lv">{effective[slot] ?? 0}</b>
                      </div>
                    );
                  })
                )}
              </section>
            )}

            {skillsSubTab === "special" && (
              <section className="char-section" data-testid="char-skills-special">
                {specialSkills.length === 0 ? (
                  <p className="char-empty">尚未学会特殊功。</p>
                ) : (
                  specialSkills.map((skill) => renderSkillRow(skill))
                )}
              </section>
            )}

            {skillsSubTab === "basic" && (
              <section className="char-section" data-testid="char-skills-basic">
                {basicSkills.length === 0 && knowledgeSkills.length === 0 ? (
                  <p className="char-empty">尚未学会基本功。</p>
                ) : (
                  <>
                    {basicSkills.length > 0 ? (
                      <div className="char-skill-group">
                        <h4 className="char-section-title">基本功</h4>
                        {basicSkills.map((skill) => renderSkillRow(skill))}
                      </div>
                    ) : null}
                    {knowledgeSkills.length > 0 ? (
                      <div className="char-skill-group">
                        <h4 className="char-section-title">杂学</h4>
                        {knowledgeSkills.map((skill) => renderSkillRow(skill))}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            )}
          </>
        )}

        {tab === "bag" && (
          <>
            <section className="char-section">
              <h4 className="char-section-title">当前佩挂</h4>
              {character.equipment.map((slot) => (
                <div className="char-equip-row" key={slot.slot}>
                  <span className="char-equip-slot">{SLOT_LABEL[slot.slot]}</span>
                  <span className="char-equip-item">{slot.item ? `□${slot.item.name}` : "空"}</span>
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
                <div className="char-inv-grid">
                  {character.inventory.map((item) => {
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
                          <span
                            className={`char-inv-name item-${item.kind}${item.equipped ? " eq" : ""}`}
                          >
                            {item.equipped ? "□" : ""}
                            {item.name}
                          </span>
                          <span className="char-inv-qty">×{item.quantity}</span>
                        </button>
                        {expanded && (
                          <div className="char-inv-detail">
                            {item.description ? (
                              <p className="char-inv-desc">{item.description}</p>
                            ) : null}
                            {item.stats && Object.keys(item.stats).length > 0 ? (
                              <p className="char-inv-stats">
                                {(
                                  Object.entries(item.stats) as Array<
                                    [keyof typeof ITEM_STAT_LABEL, number | undefined]
                                  >
                                )
                                  .filter(([, value]) => value != null && value !== 0)
                                  .map(
                                    ([key, value]) =>
                                      `${ITEM_STAT_LABEL[key]} ${value! > 0 ? "+" : ""}${value}`,
                                  )
                                  .join(" · ")}
                              </p>
                            ) : null}
                            {item.usable ? (
                              <p className="char-inv-effect">
                                {ITEM_USE_LABEL[item.usable.effect]} {item.usable.amount}
                              </p>
                            ) : null}
                            {action && onInventoryAction ? (
                              <div className="char-row-actions">
                                <Chip
                                  label={isPending(key) ? "行事中…" : action.label}
                                  variant="action"
                                  disabled={Boolean(pendingAction)}
                                  onClick={() => onInventoryAction(action.action, item.id)}
                                />
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
