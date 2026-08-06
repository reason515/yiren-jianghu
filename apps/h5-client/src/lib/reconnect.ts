/** 重连状态机（纯函数、确定性；指数退避）。 */

export type ReconnectPhase = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface ReconnectState {
  phase: ReconnectPhase;
  /** 已重试次数（从 1 起）。 */
  attempt: number;
  nextRetryMs: number;
}

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_ATTEMPTS = 5;

export function initialReconnectState(): ReconnectState {
  return { phase: "idle", attempt: 0, nextRetryMs: 0 };
}

/** 指数退避（含 0–50% 抖动，可注入固定值保证测试确定性）。 */
export function retryDelayMs(attempt: number, jitterRatio = 0.5): number {
  const base = RECONNECT_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  return Math.round(base * (1 + jitterRatio));
}

export function onConnectSuccess(s: ReconnectState): ReconnectState {
  return { phase: "connected", attempt: 0, nextRetryMs: 0 };
}

/** 连接断开：进入重连，第一次重试延迟按 attempt=1。 */
export function onDisconnect(s: ReconnectState): ReconnectState {
  return { phase: "reconnecting", attempt: 1, nextRetryMs: retryDelayMs(1) };
}

/** 一次重试失败：attempt+1；超过最大次数 → failed。 */
export function onRetryFailed(s: ReconnectState): ReconnectState {
  if (s.attempt >= RECONNECT_MAX_ATTEMPTS) {
    return { phase: "failed", attempt: s.attempt, nextRetryMs: 0 };
  }
  const attempt = s.attempt + 1;
  return { phase: "reconnecting", attempt, nextRetryMs: retryDelayMs(attempt) };
}
