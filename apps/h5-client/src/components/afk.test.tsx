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

const SKILLS = [
  { id: "basic_sword", name: "基础剑法", level: 8 },
  { id: "dodge", name: "纵跃术", level: 4 },
];

const QUESTS = [{ id: "q_hunt", name: "缉拿匪首", targetName: "劫道匪徒" }];

const TEMPLATES = [{ id: "tpl_1", name: "稳扎稳打" }];

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
  it("选武功/时长后只提交服务端支持的修炼意图", () => {
    let config: unknown = null;
    let stopped = 0;
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={QUESTS}
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
        .find((b) => b.textContent?.includes("纵跃术"))!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent === "2 时辰")!
        .click(),
    );
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({
      kind: "study",
      durationMinutes: 120,
      config: { skillId: "dodge" },
    });
  });

  it("行侠：选差事/战术/时长后只提交行侠意图（含模板 id）", () => {
    let config: unknown = null;
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={QUESTS}
        templates={TEMPLATES}
        active={false}
        statusMessage=""
        onStart={(c) => (config = c)}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "行侠")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent?.includes("缉拿匪首"))!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent === "2 时辰")!
        .click(),
    );
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({
      kind: "quest",
      templateId: "tpl_1",
      durationMinutes: 120,
      config: { questId: "q_hunt" },
    });
  });

  it("行侠：无差事或无战术时提示且不可安排", () => {
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={[]}
        templates={[]}
        active={false}
        statusMessage=""
        onStart={() => undefined}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "行侠")!
        .click(),
    );
    expect(host.textContent).toContain("先去应下一桩悬赏");
    expect(host.textContent).toContain("须先备下一套战术");
    expect(host.querySelector<HTMLButtonElement>(".btn.primary")?.disabled).toBe(true);
  });

  it("尚无武功时提示先请教，且不可安排", () => {
    const { host } = render(
      <AfkSheet
        open
        skills={[]}
        quests={QUESTS}
        templates={TEMPLATES}
        active={false}
        statusMessage=""
        onStart={() => undefined}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.textContent).toContain("先向师长请教");
    expect(host.querySelector<HTMLButtonElement>(".btn.primary")?.disabled).toBe(true);
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
