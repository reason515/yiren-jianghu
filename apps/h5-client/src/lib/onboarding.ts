/**
 * 首启引导（E14.11，方法参考 sanguo first-session-ux-v3，按本项目叙事改写）。
 * 事件驱动、可跳过、一次出现：按动线触发轻提示（GuideTip），乱序操作也跳到目标步骤。
 */

export type GuideEvent = "enter_scene" | "quest_accepted" | "skill_learned" | "battle_won";

export const GUIDE_DONE = 4;

/** 事件 → 引导步骤（步骤即进度，不回退）。 */
export const GUIDE_TARGET: Record<GuideEvent, number> = {
  enter_scene: 1,
  quest_accepted: 2,
  skill_learned: 3,
  battle_won: 4,
};

/** 引导文案（wuxia：短句、画面、无数值、不剧透机制）。 */
export const GUIDE_COPY: Record<number, string> = {
  1: "风起青萍之末。你已入江湖——先到村口听消息，酒旗底下，藏着第一桩事。",
  2: "差事已应下。出门前，先在武馆寻位师父，学一门傍身的本事。",
  3: "功夫在身，胆气也壮。村外小径有野狗游荡——去会一会，试试身手。",
  4: "江湖路远，这一程算你踏稳了。此后遇人遇事，皆自有章法。",
};

export function guideTarget(event: GuideEvent): number {
  return GUIDE_TARGET[event];
}

/** 当前进度未到目标步骤时展示（target > current），否则不打扰。 */
export function shouldShowGuide(current: number, event: GuideEvent): boolean {
  return current < guideTarget(event);
}

/** 展示/推进后的步骤：取较大值，绝不回退（乱序事件跳级不倒退）。 */
export function advanceGuide(current: number, event: GuideEvent): number {
  return Math.max(current, guideTarget(event));
}

/** 步骤对应文案；无则返回 null（不显示）。 */
export function guideText(step: number): string | null {
  return GUIDE_COPY[step] ?? null;
}

export function isOnboarded(step: number): boolean {
  return step >= GUIDE_DONE;
}
