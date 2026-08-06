import { useState, type JSX } from "react";

/**
 * 挂机状态条（mobile-ui：例行状态与停止原因不弹 toast，统一走场景区挂机条）。
 * - 运行中：显示状态消息 + 停止按钮；
 * - 停止后：显示停止原因 + 「知道了」关闭。
 */
export interface GrindBannerProps {
  active: boolean;
  message: string;
  reason?: string | null;
  onStop?: () => void;
}

export function GrindBanner({
  active,
  message,
  reason,
  onStop,
}: GrindBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  if (active) {
    return (
      <div className="grind-banner active" data-testid="grind-banner">
        <span className="grind-message">{message}</span>
        {onStop && (
          <button type="button" className="grind-stop" aria-label="停止挂机" onClick={onStop}>
            停止
          </button>
        )}
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
