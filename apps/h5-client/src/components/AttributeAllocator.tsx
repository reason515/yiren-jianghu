import { useState, type JSX } from "react";

/** 四维分配（创建/重设；数值带语义标签，加减 ≥44px，禁原生 select）。 */
export interface Attrs {
  str: number;
  int: number;
  con: number;
  dex: number;
}

export type AttrKey = keyof Attrs;

export const ATTR_KEYS: AttrKey[] = ["str", "int", "con", "dex"];

export const ATTR_META: Record<AttrKey, { label: string; hint: string }> = {
  str: { label: "膂力", hint: "气血之厚，力道之沉" },
  int: { label: "悟性", hint: "精神之盈，学艺之敏" },
  con: { label: "根骨", hint: "气血之根，体魄之坚" },
  dex: { label: "身法", hint: "闪转之敏，先手之机" },
};

export interface AttributeAllocatorProps {
  initial: Attrs;
  budget: number;
  min: number;
  max: number;
  onChange: (attrs: Attrs) => void;
}

export function AttributeAllocator({
  initial,
  budget,
  min,
  max,
  onChange,
}: AttributeAllocatorProps): JSX.Element {
  const [attrs, setAttrs] = useState<Attrs>(initial);
  const used = attrs.str + attrs.int + attrs.con + attrs.dex;
  const remaining = budget - used;

  const adjust = (key: AttrKey, delta: number): void => {
    const next = attrs[key] + delta;
    if (next < min || next > max) return;
    if (used + delta > budget) return;
    const updated = { ...attrs, [key]: next };
    setAttrs(updated);
    onChange(updated);
  };

  return (
    <div className="attr-allocator" data-testid="attr-allocator">
      <div className="attr-remaining" data-ok={remaining >= 0}>
        {remaining === 0 ? "点数已满，先减再加" : `剩余可分配：${remaining} 点`}
      </div>
      {ATTR_KEYS.map((key) => {
        const meta = ATTR_META[key];
        return (
          <div className="attr-row" key={key} data-attr={key}>
            <span className="attr-label">{meta.label}</span>
            <span className="attr-hint">{meta.hint}</span>
            <span className="attr-value">{attrs[key]}</span>
            <div className="attr-btns">
              <button
                type="button"
                className="attr-btn"
                aria-label={`${meta.label}减`}
                disabled={attrs[key] <= min}
                onClick={() => adjust(key, -1)}
              >
                −
              </button>
              <button
                type="button"
                className="attr-btn"
                aria-label={`${meta.label}加`}
                disabled={attrs[key] >= max || remaining <= 0}
                onClick={() => adjust(key, 1)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
