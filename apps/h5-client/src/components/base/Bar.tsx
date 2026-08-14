import type { JSX } from "react";

/** 状态条（气血/精神/内力等；低值色彩+文案共同警示，数值带语义标签「当前/上限」）。 */
export type BarTone = "qi" | "jing" | "jingli" | "neili";

export interface BarProps {
  value: number;
  max: number;
  tone: BarTone;
  /** 语义标签（如「气」），展示为「气 120/200」。 */
  label?: string;
}

export function Bar({ value, max, tone, label }: BarProps): JSX.Element {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const low = pct < 30;
  return (
    <div
      className={`bar ${tone}${low ? " low" : ""}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ? `${label} ${value}/${max}` : `${tone} ${value}/${max}`}
    >
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {label && (
        <span className="bar-label">
          {label} {value}/{max}
        </span>
      )}
    </div>
  );
}
