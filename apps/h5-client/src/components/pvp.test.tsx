// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { PvpReplayView } from "./PvpReplayView.js";
import { PvpView } from "./PvpView.js";
import type { PvpMatchDetail } from "../lib/pvpTypes.js";

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

const SEASON = {
  id: "s1",
  name: "江湖论剑·第1季",
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-08-21T00:00:00.000Z",
  status: "active" as const,
};

const OPPONENTS = [
  { characterId: "c_1", name: "赵客", exp: 1200 },
  { characterId: "c_2", name: "燕客", exp: 800 },
];

describe("PvpView（论剑面板）", () => {
  it("展示赛季信息与对手列表；邀战只回传对手引用", () => {
    let challenged: unknown = null;
    const { host } = render(
      <PvpView
        open
        season={SEASON}
        opponents={OPPONENTS}
        pending={false}
        onChallenge={(o) => (challenged = o)}
        onClose={() => undefined}
      />,
    );
    expect(host.querySelector("[data-testid=pvp-season]")?.textContent).toContain("江湖论剑·第1季");
    expect(host.querySelectorAll(".pvp-row")).toHaveLength(2);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((b) => b.textContent === "邀战")!
        .click(),
    );
    expect(challenged).toEqual(OPPONENTS[0]);
  });

  it("无可邀战对手时给出空态提示", () => {
    const { host } = render(
      <PvpView
        open
        season={null}
        opponents={[]}
        pending={false}
        onChallenge={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.textContent).toContain("名册上空无一人");
    expect(host.querySelector(".pvp-list")).toBeNull();
  });
});

describe("PvpReplayView（战报回放）", () => {
  const MATCH: PvpMatchDetail = {
    id: "m_1",
    result: "challenger_win",
    winner: "a",
    turns: 3,
    seed: 42,
    scoreDelta: 12,
    challengerName: "赵客",
    defenderName: "燕客",
    createdAt: "2026-08-07T00:00:00.000Z",
    events: [
      { seq: 0, type: "battle_start", data: { seed: 42 } },
      { seq: 1, type: "damage", actor: "a", data: { damage: 18 } },
      { seq: 2, type: "victory", actor: "a", data: { target: "b" } },
    ],
  };

  it("渲染双方名、积分变动、结果横幅与叙事回放", () => {
    const { host } = render(<PvpReplayView open match={MATCH} onClose={() => undefined} />);
    expect(host.textContent).toContain("赵客 对 燕客");
    expect(host.textContent).toContain("积分 +12");
    expect(host.querySelector("[data-testid=pvp-replay-result]")?.textContent).toContain(
      "这一场，你胜了。",
    );
    const lines = host.querySelectorAll(".combat-line");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(host.textContent).toMatch(/横在眼前|拦路而立|对上了/);
  });

  it("归档战报（无事件）给出提示而非空白", () => {
    const archived = { ...MATCH, events: [] };
    const { host } = render(<PvpReplayView open match={archived} onClose={() => undefined} />);
    expect(host.textContent).toContain("已归档");
  });

  it("无回放数据时给出空态", () => {
    const { host } = render(<PvpReplayView open match={null} onClose={() => undefined} />);
    expect(host.textContent).toContain("回响已散");
  });
});
