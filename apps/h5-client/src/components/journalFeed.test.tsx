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

// happy-dom 未加载 scene.css，注入最小样式以测关键字高亮 computed 值。
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent =
    ".jl-name { color: rgb(143, 191, 166); }" +
    ".jl-num { color: rgb(201, 168, 105); font-family: 'LXGW WenKai'; }";
  document.head.appendChild(style);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("JournalFeed（见闻动态流）", () => {
  const entries: JournalEntry[] = [
    { id: 1, text: "村长：村里的日子，就靠一亩三分地撑着。" },
    { id: 2, text: "交差已毕：经验 120 · 潜能 30 · 银两 5" },
    { id: 3, text: "尘埃落定——你赢了这一场。", kind: "combat" },
  ];

  it("折叠卡显示最近条目，人名前缀玉色、数字金色（关键字高亮）", () => {
    const { host } = render(<JournalFeed entries={entries} />);
    const summary = host.querySelector('[data-testid="journal-feed"]');
    expect(summary?.textContent).toContain("村长：");
    // 人名前缀 span 存在且为玉色
    const name = host.querySelector(".journal-summary .jl-name");
    expect(name?.textContent).toBe("村长：");
    expect(getComputedStyle(name!).color).toBe("rgb(143, 191, 166)");
    // 数字 span 存在且金色、文楷字体
    const nums = [...host.querySelectorAll(".journal-summary .jl-num")];
    expect(nums.length).toBeGreaterThan(0);
    expect(getComputedStyle(nums[0]!).color).toBe("rgb(201, 168, 105)");
    expect(getComputedStyle(nums[0]!).fontFamily).toContain("LXGW WenKai");
    // combat 条目高亮
    const combat = [...host.querySelectorAll<HTMLElement>(".journal-summary-line.hl")];
    expect(combat.length).toBe(1);
    // 首屏历史不打字机
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    // 折叠区可滚动容器存在（换行滚动，非单行 ellipsis）
    expect(host.querySelector(".journal-summary-text")).not.toBeNull();
  });

  it("点击折叠卡展开全屏历史，全部条目可见", () => {
    const { host } = render(<JournalFeed entries={entries} />);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="journal-feed"]')!.click());
    const panel = host.querySelector(".journal-panel");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("经验");
    expect(panel?.textContent).toContain("你赢了这一场");
  });

  it("新追加条目打字机逐批显现，打完后光标消失", () => {
    vi.useFakeTimers();
    const { host, root } = render(<JournalFeed entries={entries} />);
    const next: JournalEntry[] = [...entries, { id: 4, text: "村口守卫：站住，你从哪里来？" }];
    act(() => root.render(<JournalFeed entries={next} />));
    // 刚追加：应在打字中，全文尚未齐
    expect(host.querySelector("[data-typing='1']")).not.toBeNull();
    expect(host.querySelector(".jl-caret")).not.toBeNull();
    expect(host.textContent).not.toContain("你从哪里来？");
    // 推进足够间隔打完（约 16 字 → 8 批 × 32ms）
    act(() => {
      vi.advanceTimersByTime(32 * 20);
    });
    expect(host.textContent).toContain("你从哪里来？");
    expect(host.querySelector("[data-typing='1']")).toBeNull();
    expect(host.querySelector(".jl-caret")).toBeNull();
  });

  it("多行同时到达时一行一行串行推进，不并行", () => {
    vi.useFakeTimers();
    const { host, root } = render(<JournalFeed entries={entries} />);
    const next: JournalEntry[] = [
      ...entries,
      { id: 4, text: "甲：第一行说完。" },
      { id: 5, text: "乙：第二行随后。" },
    ];
    act(() => root.render(<JournalFeed entries={next} />));
    // 只打第一行：第二行尚未出现在 DOM
    expect(host.querySelectorAll("[data-typing='1']").length).toBe(1);
    expect(host.textContent).not.toContain("第二行随后");
    expect(host.textContent).not.toContain("第一行说完");
    // 打完第一行
    act(() => {
      vi.advanceTimersByTime(32 * 20);
    });
    expect(host.textContent).toContain("第一行说完");
    // 第二行此时才开始打，全文尚未齐
    expect(host.textContent).not.toContain("第二行随后");
    expect(host.querySelectorAll("[data-typing='1']").length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(32 * 20);
    });
    expect(host.textContent).toContain("第二行随后");
    expect(host.querySelector("[data-typing='1']")).toBeNull();
  });
});
