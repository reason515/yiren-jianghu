import type { JSX } from "react";
import type { VitalKey } from "../lib/characterTypes.js";

/**
 * 主界面顶栏生存状态条（V2.7：气/精/精力/内力 + 银两）。
 * 数值带语义标签 + stat 色点 + tabular-nums；数据来自服务端角色快照（resume/refreshCharacter）。
 * 视觉遵循墨色武侠：细线分隔、stat token 色点，滚动时吸顶（sticky）。
 */
export interface StatusBarProps {
  vitals: Record<VitalKey, number> | null;
  silver: number | null;
}

const VITAL_META: Array<{ key: VitalKey; label: string; cls: string }> = [
  { key: "qi", label: "气", cls: "qi" },
  { key: "jing", label: "精", cls: "jing" },
  { key: "jingli", label: "精力", cls: "jingli" },
  { key: "neili", label: "内力", cls: "neili" },
];

export function StatusBar({ vitals, silver }: StatusBarProps): JSX.Element {
  return (
    <div className="status-bar" data-testid="status-bar">
      {VITAL_META.map((v) => (
        <span key={v.key} className={`status-item ${v.cls}`}>
          <i className="status-dot" aria-hidden="true" />
          <em>{v.label}</em>
          <b>{vitals ? vitals[v.key] : "–"}</b>
        </span>
      ))}
      <span className="status-item silver">
        <i className="status-dot" aria-hidden="true" />
        <em>银两</em>
        <b>{silver ?? "–"}</b>
      </span>
    </div>
  );
}
