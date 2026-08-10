// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { QuestPanel } from "./QuestPanel.js";
import type { QuestPanelData } from "../lib/questTypes.js";

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

const DATA: QuestPanelData = {
  story: [
    { id: "s_begin", title: "初入江湖", done: true, current: false },
    { id: "s_learn", title: "武馆求教", done: true, current: false },
    { id: "s_graduate", title: "出村在望", done: false, current: true },
  ],
  rumors: [{ id: "r_bandit_road", text: "有人说城东官道夜里有人劫道。" }],
  quests: [
    {
      id: "q_newbie_trail",
      name: "初试身手",
      kind: "bounty",
      briefing: "村外的野狗成了祸患……村长托你走一趟村外小径。",
      phases: [
        { type: "goto", targetName: "村外小径", targetRoomId: "village_trail", done: false },
        { type: "kill", targetName: "野狗", done: false, progress: { cur: 0, need: 1 } },
      ],
      rewards: { exp: 30, potential: 8, silver: 5 },
      state: "accepted",
    },
    {
      id: "q_bounty_bandit",
      name: "缉拿匪首",
      kind: "bounty",
      briefing: "沈捕头悬了赏格……",
      phases: [
        { type: "kill", targetName: "劫道匪徒", done: false, progress: { cur: 0, need: 1 } },
      ],
      rewards: { exp: 60, potential: 15, silver: 20 },
      state: "available",
    },
  ],
};

describe("QuestPanel（任务与主线）", () => {
  it("主线节点链渲染：完成标记与当前节点", () => {
    const { host } = render(
      <QuestPanel
        data={DATA}
        onGoTo={() => undefined}
        onAccept={() => undefined}
        onReport={() => undefined}
      />,
    );
    expect(host.textContent).toContain("初入江湖");
    const chain = host.querySelectorAll(".story-node");
    expect(chain[0]!.classList.contains("done")).toBe(true);
    expect(chain[2]!.classList.contains("current")).toBe(true);
    expect(chain[2]!.textContent).toContain("今");
  });

  it("任务卡片：简报/相位进度/奖励/动作", () => {
    const { host } = render(
      <QuestPanel
        data={DATA}
        onGoTo={() => undefined}
        onAccept={() => undefined}
        onReport={() => undefined}
      />,
    );
    expect(host.textContent).toContain("村外的野狗成了祸患");
    expect(host.textContent).toContain("击杀 野狗（0/1）");
    expect(host.textContent).toContain("历练 30 · 潜能 8 · 银两 5");
  });

  it("可前往 / 接受 / 交差 回调", () => {
    const gotos: string[] = [];
    const accepts: string[] = [];
    const reports: string[] = [];
    const { host } = render(
      <QuestPanel
        data={DATA}
        onGoTo={(r) => gotos.push(r)}
        onAccept={(q) => accepts.push(q)}
        onReport={(q) => reports.push(q)}
      />,
    );
    const chips = [...host.querySelectorAll<HTMLButtonElement>(".quest-card .chip")];
    act(() => chips.find((c) => c.textContent === "前往")!.click());
    expect(gotos).toEqual(["village_trail"]);
    act(() => chips.find((c) => c.textContent === "接受")!.click());
    expect(accepts).toEqual(["q_bounty_bandit"]);
  });

  it("全部相位完成 → 交差", () => {
    const done: QuestPanelData = {
      story: [],
      rumors: [],
      quests: [
        {
          ...DATA.quests[0]!,
          phases: [
            {
              type: "goto" as const,
              targetName: "村外小径",
              targetRoomId: "village_trail",
              done: true,
            },
            {
              type: "kill" as const,
              targetName: "野狗",
              done: true,
              progress: { cur: 1, need: 1 },
            },
          ],
        },
      ],
    };
    let report = "";
    const { host } = render(
      <QuestPanel
        data={done}
        onGoTo={() => undefined}
        onAccept={() => undefined}
        onReport={(q) => (report = q)}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".quest-card .chip")]
        .find((c) => c.textContent === "交差")!
        .click(),
    );
    expect(report).toBe("q_newbie_trail");
  });
});
