import type { JSX } from "react";
import type { VitalKey } from "../lib/characterTypes.js";

/**
 * 主界面顶栏生存状态（V2.13：细轨进度条 + 双色读数，取代色点 HUD）。
 * - 生存项（气/精/精力/内力）：标签 +「当前/上限」双色数字 + 细墨轨道填充；
 * - 银两：货币非状态，右侧竖排简牍印记，与状态组视觉隔离。
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

function pctOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function StatusBar({ vitals, vitalsMax, silver }: StatusBarProps): JSX.Element {
  return (
    <div className="status-bar" data-testid="status-bar">
      <div className="status-vitals" role="group" aria-label="生存状态">
        {VITAL_META.map((v) => {
          const cur = vitals?.[v.key];
          const max = vitalsMax?.[v.key];
          const ready = typeof cur === "number" && typeof max === "number";
          const pct = ready ? pctOf(cur, max) : 0;
          const low = ready && pct < 30;
          return (
            <div
              key={v.key}
              className={`status-vital ${v.cls}${low ? " low" : ""}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={ready ? max : 0}
              aria-valuenow={ready ? cur : 0}
              aria-label={ready ? `${v.label} ${cur}/${max}` : v.label}
            >
              <div className="status-vital-head">
                <em>{v.label}</em>
                <b>
                  {ready ? (
                    <>
                      <span className="status-cur">{cur}</span>
                      <i>/</i>
                      <span className="status-max">{max}</span>
                    </>
                  ) : (
                    <span className="status-max">–</span>
                  )}
                </b>
              </div>
              <div className="status-vital-track" aria-hidden="true">
                <div className="status-vital-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <span className="status-silver" data-testid="status-silver">
        <em>银两</em>
        <b>{silver ?? "–"}</b>
      </span>
    </div>
  );
}
