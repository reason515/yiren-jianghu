import type { JSX } from "react";

/** 场景动作 / 人物 / 物品 chip（触控区 ≥44px；玉色=可做，金色=绝招，朱砂=高风险）。 */
export type ChipVariant = "action" | "perform" | "npc" | "item" | "danger";

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  onClick?: () => void;
  disabled?: boolean;
}

export function Chip({ label, variant = "action", onClick, disabled }: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      className={`chip ${variant}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {label}
    </button>
  );
}
