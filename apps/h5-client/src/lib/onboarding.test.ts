import { describe, expect, it } from "vitest";
import {
  advanceGuide,
  GUIDE_COPY,
  GUIDE_DONE,
  guideTarget,
  guideText,
  isOnboarded,
  shouldShowGuide,
} from "./onboarding.js";

describe("首启引导状态机", () => {
  it("事件 → 目标步骤：进场景/接任务/学武/首战依次推进", () => {
    expect(guideTarget("enter_scene")).toBe(1);
    expect(guideTarget("quest_accepted")).toBe(2);
    expect(guideTarget("skill_learned")).toBe(3);
    expect(guideTarget("battle_won")).toBe(4);
    expect(GUIDE_DONE).toBe(4);
  });

  it("shouldShowGuide：进度未到目标才展示", () => {
    expect(shouldShowGuide(0, "quest_accepted")).toBe(true);
    expect(shouldShowGuide(2, "quest_accepted")).toBe(false);
    expect(shouldShowGuide(3, "quest_accepted")).toBe(false);
  });

  it("advanceGuide 乱序跳级且不回退", () => {
    expect(advanceGuide(0, "battle_won")).toBe(4); // 直接首战（跳过中间提示）
    expect(advanceGuide(4, "enter_scene")).toBe(4); // 完成后再触发不倒退
    expect(advanceGuide(2, "skill_learned")).toBe(3);
  });

  it("每个步骤都有文案；完成判定", () => {
    expect(guideText(1)).toContain("风起青萍");
    expect(guideText(2)).toBeTruthy();
    expect(guideText(3)).toBeTruthy();
    expect(guideText(4)).toBeTruthy();
    expect(guideText(0)).toBeNull();
    expect(guideText(5)).toBeNull();
    expect(isOnboarded(4)).toBe(true);
    expect(isOnboarded(3)).toBe(false);
    // 文案为 wuxia 短句：不含数值与说明文
    for (const text of Object.values(GUIDE_COPY)) {
      expect(text).not.toMatch(/\d/);
      expect(text.length).toBeLessThanOrEqual(60);
    }
  });
});
