import { describe, expect, it, vi } from "vitest";
import { pvpResultView, seasonRemainLabel } from "./pvpTypes.js";

describe("论剑数据适配", () => {
  it("结果横幅：胜/负/平各给出我方视角文案", () => {
    expect(pvpResultView("challenger_win")).toEqual({ text: "这一场，你胜了。", won: true });
    expect(pvpResultView("defender_win")).toEqual({ text: "这一场，你败了。", won: false });
    expect(pvpResultView("draw")).toEqual({ text: "两下未分胜负。", won: false });
  });

  it("赛季剩余天数不泄漏内部时间戳", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    expect(seasonRemainLabel("2026-08-10T00:00:00.000Z")).toBe(" · 余 3 日");
    expect(seasonRemainLabel("2026-08-07T00:00:00.000Z")).toBe(" · 今日收官");
    expect(seasonRemainLabel("2026-08-05T00:00:00.000Z")).toBe(" · 今日收官");
    vi.useRealTimers();
  });
});
