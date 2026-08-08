import type { JSX } from "react";
import type { VitalKey } from "../lib/characterTypes.js";

/**
 * 主界面顶栏生存状态条（V2.9 双值；V2.10 两行网格，参照 xkx vitals 2×2）。
 * - 生存状态（气/精/精力/内力）：「当前/上限」双值，2×2 网格两行排布，不再单行拥挤；
 * - 银两：货币非状态，右侧独立金色胶囊徽章，与状态组视觉隔离。
 * 数据来自服务端角色快照（resume/refreshCharacter）。
 */
export interface StatusBarProps {
  vitals: Record<VitalKey, number> | null;
  vitalsMax: Record<VitalKey, number> | null;
  silver: number | null;
}

const VITAL_META: Array<{ key: VitalKey; label: string; cls: string }> = [
  { key: "qi", label: "气", cls: "qi" },
  { key: "jing", label: "精", cls: "jing" },
  { key: "jingli", label: "精力", cls: "jingli" },
  { key: "neili", label: "内力", cls: "neili" },
];

export function StatusBar({ vitals, vitalsMax, silver }: StatusBarProps): JSX.Element {
  return (
    <div className="status-bar" data-testid="status-bar">
      <div className="status-vitals" role="group" aria-label="生存状态">
        {VITAL_META.map((v) => (
          <span key={v.key} className={`status-item ${v.cls}`}>
            <i className="status-dot" aria-hidden="true" />
            <em>{v.label}</em>
            <b>{vitals && vitalsMax ? `${vitals[v.key]}/${vitalsMax[v.key]}` : "–"}</b>
          </span>
        ))}
      </div>
      <span className="status-silver" data-testid="status-silver">
        <i className="silver-dot" aria-hidden="true" />
        <em>银两</em>
        <b>{silver ?? "–"}</b>
      </span>
    </div>
  );
}
