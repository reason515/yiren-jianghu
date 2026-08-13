// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { JournalFeed, type JournalEntry } from "./JournalFeed.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent =
    ".jl-name { color: rgb(143, 191, 166); }" +
    ".jl-num { color: rgb(201, 168, 105); font-family: 'Noto Serif SC'; }";
  document.head.appendChild(style);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("JournalFeed（见闻动态流）", () => {
  const entries: JournalEntry[] = [
    { id: 1, text: "村长：村里的日子，就靠一亩三分地撑着。" },
    { id: 2, text: "交差已毕：历练 120 · 潜能 30 · 银两 5" },
    { id: 3, text: "尘埃落定——你赢了这一场。", kind: "combat" },
  ];

  it("折叠卡显示最近条目，人名前缀玉色、数字金色（关键字高亮）", () => {
    const { host } = render(<JournalFeed entries={entries} />);
    expect(host.querySelector('[data-testid="journal-feed"]')?.textContent).toContain("村长：");
    const name = host.querySelector(".journal-summary .jl-name");
    expect(name?.textContent).toBe("村长：");
    expect(getComputedStyle(name!).color).toBe("rgb(143, 191, 166)");
    const nums = [...host.querySelectorAll(".journal-summary .jl-num")];
    expect(nums.length).toBeGreaterThan(0);
    expect(getComputedStyle(nums[0]!).color).toBe("rgb(201, 168, 105)");
    expect(host.querySelectorAll<HTMLElement>(".journal-summary-line.hl").length).toBe(1);
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    expect(host.querySelector(".journal-summary-text")).not.toBeNull();
  });

  it("点击折叠卡展开历史，全部条目可见", () => {
    const { host } = render(<JournalFeed entries={entries} />);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="journal-feed"]')!.click());
    expect(host.querySelector(".journal-panel")?.textContent).toContain("历练");
    expect(host.querySelector(".journal-panel")?.textContent).toContain("你赢了这一场");
  });

  it("新追加末行打字机显现，打完回调 onEntrySettled", () => {
    vi.useFakeTimers();
    const settled: number[] = [];
    const { host, root } = render(
      <JournalFeed entries={entries} onEntrySettled={(id) => settled.push(id)} />,
    );
    act(() =>
      root.render(
        <JournalFeed
          entries={[...entries, { id: 4, text: "村口守卫：站住，你从哪里来？" }]}
          onEntrySettled={(id) => settled.push(id)}
        />,
      ),
    );
    expect(host.querySelector("[data-typing='1']")).not.toBeNull();
    expect(host.textContent).not.toContain("你从哪里来？");
    act(() => {
      vi.advanceTimersByTime(32 * 20);
    });
    expect(host.textContent).toContain("你从哪里来？");
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    expect(settled).toContain(4);
  });

  it("展开/收起不重播打字机，仅全文切换", () => {
    vi.useFakeTimers();
    const settled: number[] = [];
    const withNew = [...entries, { id: 4, text: "村口守卫：站住，你从哪里来？" }];
    const onSettled = (id: number): void => {
      settled.push(id);
    };
    const { host, root } = render(<JournalFeed entries={entries} onEntrySettled={onSettled} />);
    act(() => root.render(<JournalFeed entries={withNew} onEntrySettled={onSettled} />));
    expect(host.querySelector("[data-typing='1']")).not.toBeNull();

    act(() => host.querySelector<HTMLButtonElement>('[data-testid="journal-feed"]')!.click());
    expect(host.querySelector(".journal-panel")).not.toBeNull();
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    expect(host.textContent).toContain("你从哪里来？");
    expect(settled).toContain(4);

    act(() => host.querySelector<HTMLButtonElement>(".journal-expand-close")!.click());
    expect(host.querySelector('[data-testid="journal-feed"]')).not.toBeNull();
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    expect(host.textContent).toContain("你从哪里来？");
  });
});
