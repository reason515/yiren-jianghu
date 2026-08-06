// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { LeaderboardView } from "./LeaderboardView.js";
import type { LeaderboardData } from "../lib/leaderboardTypes.js";

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

const GROWTH: LeaderboardData = {
  kind: "growth",
  entries: [
    { rank: 1, characterId: "c_a", name: "张三丰", value: 99999, isMe: false },
    { rank: 2, characterId: "c_me", name: "陆小风", value: 50000, isMe: true },
    { rank: 3, characterId: "c_b", name: "李四", value: 30000, isMe: false },
  ],
};

const SEASON: LeaderboardData = {
  kind: "season_pvp",
  season: { id: "s1", name: "首季·初鸣", status: "active", endsAt: "腊月" },
  entries: [
    { rank: 1, characterId: "c_x", name: "王五", value: 1680, isMe: false },
    { rank: 2, characterId: "c_me", name: "陆小风", value: 1320, isMe: true },
  ],
};

describe("LeaderboardView（排行榜）", () => {
  it("成长榜渲染排名/名/语义标签；我的行高亮", () => {
    const { host } = render(
      <LeaderboardView open growth={GROWTH} season={SEASON} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("张三丰");
    expect(host.textContent).toContain("经验 50000");
    const me = [...host.querySelectorAll<HTMLLIElement>(".lb-row")].find((r) =>
      r.textContent?.includes("陆小风"),
    )!;
    expect(me.classList.contains("me")).toBe(true);
  });

  it("切到论剑榜显示赛季信息与积分", () => {
    const { host } = render(
      <LeaderboardView open growth={GROWTH} season={SEASON} onClose={() => undefined} />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "论剑榜")!
        .click(),
    );
    expect(host.querySelector("[data-testid=lb-season]")?.textContent).toContain("首季·初鸣");
    expect(host.textContent).toContain("赛季进行中");
    expect(host.textContent).toContain("积分 1680");
  });

  it("空榜提示", () => {
    const empty: LeaderboardData = { kind: "growth", entries: [] };
    const { host } = render(
      <LeaderboardView open growth={empty} season={SEASON} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("榜上尚无留名");
  });
});
