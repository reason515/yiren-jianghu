// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { AfkReportView } from "./AfkReportView.js";
import { AfkSheet } from "./AfkSheet.js";
import { GrindBanner } from "./GrindBanner.js";
import type { AfkReportData as Report } from "../lib/afkTypes.js";

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

const TEMPLATES = [
  { id: "t1", name: "稳妥历练" },
  { id: "t2", name: "论剑激进" },
];

describe("GrindBanner（挂机状态条）", () => {
  it("运行中显示状态消息与停止按钮", () => {
    let stopped = 0;
    const { host } = render(
      <GrindBanner active message="任务挂机 · 前往衙门" onStop={() => (stopped += 1)} />,
    );
    expect(host.querySelector("[data-testid=grind-banner]")?.textContent).toContain("前往衙门");
    act(() => host.querySelector<HTMLButtonElement>(".grind-stop")!.click());
    expect(stopped).toBe(1);
  });

  it("停止原因显示 + 「知道了」关闭", () => {
    const { host } = render(<GrindBanner active={false} message="" reason="挂机时长已达上限" />);
    expect(host.querySelector("[data-testid=grind-reason]")?.textContent).toContain(
      "挂机时长已达上限",
    );
    act(() => host.querySelector<HTMLButtonElement>(".grind-dismiss")!.click());
    expect(host.querySelector("[data-testid=grind-reason]")).toBeNull();
  });
});

describe("AfkSheet（挂机启动）", () => {
  it("选模板/时长后启动，回调携带 config；运行中显示停止", () => {
    let config: unknown = null;
    let stopped = 0;
    const { host } = render(
      <AfkSheet
        open
        templates={TEMPLATES}
        active={false}
        statusMessage=""
        onStart={(c) => (config = c)}
        onStop={() => (stopped += 1)}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent === "论剑激进")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent === "2 时辰")!
        .click(),
    );
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({ mode: "quest", templateId: "t2", durationMinutes: 120 });
  });
});

describe("AfkReportView（战报）", () => {
  const REPORT: Report = {
    jobId: "job_1",
    kind: "quest",
    status: "completed",
    durationMinutes: 120,
    gains: { exp: 120, potential: 30, silver: 40 },
    narrative:
      "你在村外小径来回走了几趟，衣摆沾了露水。悬赏的贼人被收拾干净，回衙门交差时，沈捕头难得地笑了一下。",
  };

  it("渲染叙事回响与收益摘要；失败显示原因", () => {
    const { host } = render(<AfkReportView open report={REPORT} onClose={() => undefined} />);
    expect(host.textContent).toContain("衣摆沾了露水");
    expect(host.textContent).toContain("经验 +120");
    expect(host.textContent).toContain("行止已竟");
  });

  it("失败战报显示原因", () => {
    const failed = { ...REPORT, status: "failed" as const, reason: "目标房间不可达" };
    const { host } = render(<AfkReportView open report={failed} onClose={() => undefined} />);
    expect(host.textContent).toContain("目标房间不可达");
    expect(host.textContent).toContain("行止中断");
  });
});
