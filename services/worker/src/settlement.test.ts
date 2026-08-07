import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type GameParams } from "@yjh/game-core";
import { settleStudy, attemptsForHours } from "./settlement.js";

const PARAMS: GameParams = DEFAULT_PARAMS;

describe("settleStudy", () => {
  it("逐次参悟：扣精、攒点、升级", () => {
    const res = settleStudy({
      params: PARAMS,
      jing: 300,
      skillId: "basic_sword",
      skills: {},
      maxLevel: 100,
      attempts: 5,
    });
    // studyCost = 80 + level；0级80、1级81、2级82…精 300 够 3 次（80+81+81=242）
    expect(res.attempts).toBe(3);
    expect(res.jingSpent).toBe(242);
    // 每次 1 点：0 级需 1 点升级，1 级需 2 点升级
    expect(res.skills.basic_sword).toMatchObject({ level: 2, practicePoints: 0 });
    expect(res.levelsGained).toBe(2);
  });

  it("精不足立即停止；满级停止", () => {
    const noJing = settleStudy({
      params: PARAMS,
      jing: 0,
      skillId: "basic_sword",
      skills: {},
      maxLevel: 100,
      attempts: 5,
    });
    expect(noJing.attempts).toBe(0);
    expect(noJing.jingSpent).toBe(0);

    const maxed = settleStudy({
      params: PARAMS,
      jing: 500,
      skillId: "basic_sword",
      skills: { basic_sword: { level: 1, practicePoints: 0 } },
      maxLevel: 1,
      attempts: 5,
    });
    expect(maxed.attempts).toBe(0);
    expect(maxed.levelsGained).toBe(0);
  });

  it("attemptsForHours：按小时换算并封顶", () => {
    expect(attemptsForHours(0.5, 12)).toBe(6);
    expect(attemptsForHours(-1, 12)).toBe(0);
    expect(attemptsForHours(200, 12)).toBe(2000);
  });
});
