/** 战斗演出辅助（mobile-ui：绝招施展只加一条高亮文本，不做粒子特效）。 */

export interface PerformLineLike {
  id: number;
  kind?: string;
}

/** 返回事件流中最近一条绝招（perform）演出行，用于入场高亮。 */
export function latestPerformLine<T extends PerformLineLike>(lines: T[]): T | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.kind === "perform") return lines[i];
  }
  return undefined;
}
