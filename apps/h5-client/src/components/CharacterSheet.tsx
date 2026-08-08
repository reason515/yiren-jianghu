import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { CharacterView, SkillCategory, VitalKey } from "../lib/characterTypes.js";

/** 人物簿：每一次修习、佩挂与使用都提交服务端，刷新后的快照才是事实。 */
export interface CharacterSheetProps {
  open: boolean;
  character: CharacterView;
  onClose: () => void;
  pendingAction?: string | null;
  onSkillAction?: (action: "learn" | "practice" | "study", skillId: string) => void;
  onInventoryAction?: (action: "equip" | "unequip" | "use", itemId: string) => void;
  /** 放弃角色入口（由上层接 ConfirmSheet 二次确认）。 */
  onDiscard?: () => void;
}

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

function masteryClass(level: number, maxLevel: number): string {
  const ratio = maxLevel > 0 ? level / maxLevel : 0;
  if (ratio < 0.15) return "mastery-1";
  if (ratio < 0.35) return "mastery-2";
  if (ratio < 0.55) return "mastery-3";
  if (ratio < 0.75) return "mastery-4";
  if (ratio < 0.95) return "mastery-5";
  return "mastery-6";
}

const SLOT_LABEL: Record<"weapon" | "armor", string> = { weapon: "兵器", armor: "护具" };

export function CharacterSheet({
  open,
  character,
  onClose,
  pendingAction = null,
  onSkillAction,
  onInventoryAction,
  onDiscard,
}: CharacterSheetProps): JSX.Element | null {
  const isPending = (key: string): boolean => pendingAction === key;
  const itemAction = (item: CharacterView["inventory"][number]) => {
    if (item.equipped) return { action: "unequip" as const, label: "卸下" };
    if (item.kind === "weapon" || item.kind === "armor")
      return { action: "equip" as const, label: "佩上" };
    if (item.kind === "drug" || item.kind === "food")
      return { action: "use" as const, label: "使用" };
    return null;
  };

  return (
    <Sheet open={open} title={character.name} onClose={onClose}>
      <div className="char-summary" aria-label="历练">
        <span className="res exp">
          <i className="dot" aria-hidden="true" />
          经验 {character.exp}
        </span>
        <span className="res pot">
          <i className="dot" aria-hidden="true" />
          可用潜能 {character.effectivePotential}
        </span>
        <span className="res silver">
          <i className="dot" aria-hidden="true" />
          银两 {character.silver}
        </span>
      </div>

      <section className="char-section">
        <h4 className="char-section-title">行止</h4>
        <div className="char-vitals" aria-label="当前行止">
          {(Object.keys(VITAL_META) as VitalKey[]).map((key) => (
            <div className={`char-vital ${VITAL_META[key].tone}`} key={key}>
              <span>{VITAL_META[key].label}</span>
              <strong>{character.vitals[key]}</strong>
            </div>
          ))}
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

      <section className="char-section">
        <h4 className="char-section-title">武功</h4>
        {character.skills.map((skill) => (
          <div className="char-skill-row" key={skill.id}>
            <span className={`char-skill-name ${SKILL_CLASS[skill.category]}`}>{skill.name}</span>
            <em className={`char-skill-level ${masteryClass(skill.level, skill.maxLevel)}`}>
              Lv {skill.level}
            </em>
            <i className="char-skill-bar">
              <b
                style={{
                  width: `${skill.maxLevel > 0 ? Math.min(100, (skill.level / skill.maxLevel) * 100) : 0}%`,
                }}
              />
            </i>
            {onSkillAction && (
              <div className="char-row-actions">
                {(["learn", "practice", "study"] as const).map((action) => {
                  const label =
                    action === "learn" ? "请教" : action === "practice" ? "演练" : "参悟";
                  const key = `skill:${action}:${skill.id}`;
                  return (
                    <Chip
                      key={action}
                      label={isPending(key) ? "行功中…" : label}
                      variant="action"
                      disabled={Boolean(pendingAction) || (action !== "learn" && skill.level <= 0)}
                      onClick={() => onSkillAction(action, skill.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="char-section">
        <h4 className="char-section-title">装备</h4>
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
            return (
              <div className="char-inv-row" key={item.id}>
                <span className={`char-inv-name item-${item.kind}`}>
                  {item.name}
                  {item.equipped ? "（已佩）" : ""}
                </span>
                <span className="char-inv-qty">×{item.quantity}</span>
                {action && onInventoryAction && (
                  <Chip
                    label={isPending(key) ? "行事中…" : action.label}
                    variant="action"
                    disabled={Boolean(pendingAction)}
                    onClick={() => onInventoryAction(action.action, item.id)}
                  />
                )}
              </div>
            );
          })
        )}
      </section>

      {onDiscard && (
        <div className="char-footer">
          <Chip label="放弃角色" variant="danger" onClick={onDiscard} />
        </div>
      )}
    </Sheet>
  );
}
