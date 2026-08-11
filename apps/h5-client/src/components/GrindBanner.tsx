import { useState, type JSX } from "react";

/**
 * 挂机状态条：运行中显示进度与累计收益；暂停显示断线原因。
 */
export interface GrindBannerProps {
  active: boolean;
  message: string;
  reason?: string | null;
  progress?: number;
  gains?: { exp: number; potential: number; silver: number };
  paused?: boolean;
  onStop?: () => void;
  onResume?: () => void;
}

export function GrindBanner({
  active,
  message,
  reason,
  progress = 0,
  gains = { exp: 0, potential: 0, silver: 0 },
  paused = false,
  onStop,
  onResume,
}: GrindBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  if (active) {
    const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
    return (
      <div className={`grind-banner active${paused ? " paused" : ""}`} data-testid="grind-banner">
        <div className="grind-banner-main">
          <span className="grind-message">{message}</span>
          <div className="grind-progress-track" aria-hidden>
            <div className="grind-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="grind-gains">
            <span className="gain-exp">历练 {Math.floor(gains.exp)}</span>
            <span className="gain-sep"> · </span>
            <span className="gain-pot">潜能 {Math.floor(gains.potential)}</span>
            <span className="gain-sep"> · </span>
            <span className="gain-silver">银 {Math.floor(gains.silver)}</span>
          </span>
        </div>
        <div className="grind-banner-actions">
          {paused && onResume ? (
            <button type="button" className="grind-resume" onClick={onResume}>
              继续
            </button>
          ) : null}
          {onStop ? (
            <button type="button" className="grind-stop" aria-label="停止挂机" onClick={onStop}>
              停止
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (reason && !dismissed) {
    return (
      <div className="grind-banner stopped" data-testid="grind-reason">
        <span className="grind-message">{reason}</span>
        <button type="button" className="grind-dismiss" onClick={() => setDismissed(true)}>
          知道了
        </button>
      </div>
    );
  }

  return null;
}
