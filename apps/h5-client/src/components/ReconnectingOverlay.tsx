import type { JSX } from "react";

/** 断线重连提示（全屏遮罩；手动重试）。 */
export interface ReconnectingOverlayProps {
  visible: boolean;
  attempt: number;
  nextRetryMs: number;
  onRetryNow: () => void;
}

export function ReconnectingOverlay({
  visible,
  attempt,
  nextRetryMs,
  onRetryNow,
}: ReconnectingOverlayProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <div className="reconnect-overlay" role="alert" data-testid="reconnect-overlay">
      <p className="reconnect-title">连接已断开</p>
      <p className="reconnect-detail" data-testid="reconnect-detail">
        第 {attempt} 次重连中…
        {nextRetryMs > 0 ? `（${Math.ceil(nextRetryMs / 1000)} 秒后重试）` : ""}
      </p>
      <button type="button" className="btn primary" onClick={onRetryNow}>
        立即重连
      </button>
    </div>
  );
}
