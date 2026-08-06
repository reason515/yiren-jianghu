// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import {
  RECONNECT_MAX_ATTEMPTS,
  initialReconnectState,
  onConnectSuccess,
  onDisconnect,
  onRetryFailed,
  retryDelayMs,
} from "../lib/reconnect.js";
import { ReconnectingOverlay } from "../components/ReconnectingOverlay.js";
import { createResumeClient } from "../lib/resumeClient.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("reconnect 状态机", () => {
  it("断开 → reconnecting(attempt=1)；重连失败递增；超过最大次数 → failed", () => {
    const idle = initialReconnectState();
    expect(idle.phase).toBe("idle");
    const d = onDisconnect(idle);
    expect(d).toMatchObject({ phase: "reconnecting", attempt: 1 });
    let s = d;
    for (let i = 1; i < RECONNECT_MAX_ATTEMPTS; i++) {
      s = onRetryFailed(s);
      expect(s.phase).toBe("reconnecting");
      expect(s.attempt).toBe(i + 1);
    }
    s = onRetryFailed(s);
    expect(s.phase).toBe("failed");
  });

  it("连接成功重置；重连成功回到 connected", () => {
    let s = onDisconnect(initialReconnectState());
    s = onConnectSuccess(s);
    expect(s).toEqual({ phase: "connected", attempt: 0, nextRetryMs: 0 });
  });

  it("重试延迟指数退避（1s → 2s → 4s，含抖动）", () => {
    expect(retryDelayMs(1, 0)).toBe(1000);
    expect(retryDelayMs(2, 0)).toBe(2000);
    expect(retryDelayMs(3, 0)).toBe(4000);
  });
});

describe("ReconnectingOverlay", () => {
  it("可见时渲染倒计时与立即重连；隐藏不渲染", () => {
    let retried = 0;
    const { host } = render(
      <ReconnectingOverlay
        visible
        attempt={2}
        nextRetryMs={2000}
        onRetryNow={() => (retried += 1)}
      />,
    );
    expect(host.querySelector("[data-testid=reconnect-overlay]")?.textContent).toContain(
      "第 2 次重连中",
    );
    expect(host.textContent).toContain("2 秒后重试");
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(retried).toBe(1);
  });
});

describe("resumeClient（/session/resume）", () => {
  it("成功解析恢复点", async () => {
    const client = createResumeClient(
      "https://api.test",
      (async () =>
        new Response(
          JSON.stringify({
            stateVersion: 7,
            character: { id: "char_1" },
            pendingAfkReports: [
              { jobId: "job_1", kind: "quest", status: "completed", stopReason: "时长上限" },
            ],
            pendingPvpReportIds: ["m_1"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    const data = await client.resume("tok");
    expect(data.stateVersion).toBe(7);
    expect(data.pendingAfkReports[0]?.stopReason).toBe("时长上限");
    expect(data.pendingPvpReportIds).toEqual(["m_1"]);
  });

  it("401 抛 ApiError", async () => {
    const client = createResumeClient(
      "https://api.test",
      (async () =>
        new Response(JSON.stringify({ error: { code: "unauthorized", message: "登录已过期" } }), {
          status: 401,
        })) as typeof fetch,
    );
    await expect(client.resume("bad")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
});
