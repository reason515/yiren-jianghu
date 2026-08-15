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

const GRINDS = [
  {
    id: "village_chore",
    name: "村中杂役",
    description: "帮村民劈柴挑水。",
    maxExp: 2000,
    hourlyGain: { exp: 36, potential: 18, silver: 8 },
    jingPerHour: 12,
  },
];

describe("GrindBanner（挂机状态条）", () => {
  it("运行中显示状态消息、进度收益与停止按钮", () => {
    let stopped = 0;
    const { host } = render(
      <GrindBanner
        active
        message="任务挂机 · 前往衙门"
        progress={0.4}
        gains={{ exp: 12, potential: 6, silver: 3 }}
        onStop={() => (stopped += 1)}
      />,
    );
    const text = host.querySelector("[data-testid=grind-banner]")?.textContent ?? "";
    expect(text).toContain("前往衙门");
    expect(text).toContain("历练 12");
    expect(text).toContain("潜能 6");
    act(() => host.querySelector<HTMLButtonElement>(".grind-stop")!.click());
    expect(stopped).toBe(1);
  });

  it("暂停态可继续", () => {
    let resumed = 0;
    const { host } = render(
      <GrindBanner
        active
        paused
        message="气息中断，挂机暂歇"
        onResume={() => (resumed += 1)}
        onStop={() => undefined}
      />,
    );
    act(() => host.querySelector<HTMLButtonElement>(".grind-resume")!.click());
    expect(resumed).toBe(1);
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
  it("选武功/时长后提交练功意图", () => {
    let config: unknown = null;
    let stopped = 0;
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={QUESTS}
        templates={TEMPLATES}
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={(c) => (config = c)}
        onStop={() => (stopped += 1)}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "离线")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "练功")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent?.includes("纵跃术"))!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".tactic-chip")]
        .find((b) => b.textContent === "1 时辰")!
        .click(),
    );
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({
      kind: "practice",
      presence: "offline",
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
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={(c) => (config = c)}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "离线")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
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
        .find((b) => b.textContent === "1 时辰")!
        .click(),
    );
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({
      kind: "quest",
      presence: "offline",
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
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={() => undefined}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "离线")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
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
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={() => undefined}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "离线")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "练功")!
        .click(),
    );
    expect(host.textContent).toContain("先向师长请教");
    expect(host.querySelector<HTMLButtonElement>(".btn.primary")?.disabled).toBe(true);
  });

  it("生计：默认页可选杂役并提交 grind 意图（含 presence）", () => {
    let config: unknown = null;
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={QUESTS}
        templates={TEMPLATES}
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={(c) => (config = c)}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.textContent).toContain("村中杂役");
    expect(host.textContent).toContain("跑完一趟即可领奖");
    act(() => host.querySelector<HTMLButtonElement>(".btn.primary")!.click());
    expect(config).toEqual({
      kind: "grind",
      presence: "online",
      durationMinutes: 15,
      config: { jobId: "village_chore" },
    });
  });

  it("默认在线且在线方式隐藏修炼，时长偏短", () => {
    const { host } = render(
      <AfkSheet
        open
        skills={SKILLS}
        quests={QUESTS}
        templates={TEMPLATES}
        grindJobs={GRINDS}
        active={false}
        statusMessage=""
        onStart={() => undefined}
        onStop={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "练功")).toBe(false);
    expect(host.textContent).toContain("一刻");
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
    expect(host.textContent).toContain("历练 +120");
    expect(host.textContent).toContain("挂机已完成");
    expect(host.textContent).toContain("历时 1 时辰");
    expect(host.querySelector(".gain-exp")).toBeTruthy();
    expect(host.querySelector(".gain-pot")).toBeTruthy();
    expect(host.querySelector(".gain-silver")).toBeTruthy();
  });

  it("收益取整到整数，不展示小数尾巴", () => {
    const fractional: Report = {
      ...REPORT,
      gains: { exp: 36.999999999, potential: 18.5, silver: 8.123456789 },
    };
    const { host } = render(<AfkReportView open report={fractional} onClose={() => undefined} />);
    expect(host.textContent).toContain("历练 +36");
    expect(host.textContent).toContain("潜能 +18");
    expect(host.textContent).toContain("银两 +8");
    expect(host.textContent).not.toMatch(/\d+\.\d+/);
  });

  it("失败战报显示原因", () => {
    const failed = { ...REPORT, status: "failed" as const, reason: "目标房间不可达" };
    const { host } = render(<AfkReportView open report={failed} onClose={() => undefined} />);
    expect(host.textContent).toContain("目标房间不可达");
    expect(host.textContent).toContain("挂机已中断");
  });
});
