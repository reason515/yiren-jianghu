import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { CharacterView, SkillCategory } from "../lib/characterTypes.js";

/** 角色面板（mobile-ui：四维当前/先天、武功门类与精通、物品分类；数值带语义标签）。 */
export interface CharacterSheetProps {
  open: boolean;
  character: CharacterView;
  onClose: () => void;
  /** 放弃角色入口（由上层接 ConfirmSheet 二次确认）。 */
  onDiscard?: () => void;
}

const ATTR_META: Record<keyof CharacterView["attrs"], { label: string; color: string }> = {
  str: { label: "膂力", color: "var(--attr-str)" },
  int: { label: "悟性", color: "var(--attr-int)" },
  con: { label: "根骨", color: "var(--attr-con)" },
  dex: { label: "身法", color: "var(--attr-dex)" },
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

const SLOT_LABEL: Record<"weapon" | "armor", string> = {
  weapon: "兵器",
  armor: "护具",
};

export function CharacterSheet({
  open,
  character,
  onClose,
  onDiscard,
}: CharacterSheetProps): JSX.Element | null {
  return (
    <Sheet open={open} title={character.name} onClose={onClose}>
      <p className="char-summary">
        经验 {character.exp} · 可用潜能 {character.effectivePotential} · 银两 {character.silver}
      </p>

      <section className="char-section">
        <h4 className="char-section-title">四维</h4>
        {(Object.keys(ATTR_META) as Array<keyof CharacterView["attrs"]>).map((key) => {
          const meta = ATTR_META[key];
          const attr = character.attrs[key];
          return (
            <div className="char-attr-row" key={key} data-attr={key}>
              <span className="char-attr-label" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <span className="char-attr-value">
                当前 {attr.cur} · 先天 {attr.base}
              </span>
            </div>
          );
        })}
      </section>

      <section className="char-section">
        <h4 className="char-section-title">武功</h4>
        {character.skills.map((s) => (
          <div className="char-skill-row" key={s.id}>
            <span className={`char-skill-name ${SKILL_CLASS[s.category]}`}>{s.name}</span>
            {s.equipped && <span className="char-skill-mark">□</span>}
            <em className={`char-skill-level ${masteryClass(s.level, s.maxLevel)}`}>
              Lv {s.level}
            </em>
            <i className="char-skill-bar">
              <b
                style={{
                  width: `${s.maxLevel > 0 ? Math.min(100, (s.level / s.maxLevel) * 100) : 0}%`,
                }}
              />
            </i>
          </div>
        ))}
      </section>

      <section className="char-section">
        <h4 className="char-section-title">装备</h4>
        {character.equipment.map((slot) => (
          <div className="char-equip-row" key={slot.slot}>
            <span className="char-equip-slot">{SLOT_LABEL[slot.slot]}</span>
            <span className="char-equip-item">{slot.item?.name ?? "空"}</span>
          </div>
        ))}
      </section>

      <section className="char-section">
        <h4 className="char-section-title">行囊</h4>
        {character.inventory.length === 0 ? (
          <p className="char-empty">行囊空空如也。</p>
        ) : (
          character.inventory.map((it) => (
            <div className="char-inv-row" key={it.id}>
              <span className={`char-inv-name item-${it.kind}`}>
                {it.name}
                {it.equipped ? "（已装备）" : ""}
              </span>
              <span className="char-inv-qty">×{it.quantity}</span>
            </div>
          ))
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
