import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type GameParams } from "@yjh/game-core";
import { settleDazuo, settlePractice, settleTuna, attemptsForHours } from "./settlement.js";

const PARAMS: GameParams = DEFAULT_PARAMS;

describe("settlePractice", () => {
  it("逐次练功：扣气、攒点、升级", () => {
    const res = settlePractice({
      params: PARAMS,
      qi: 300,
      skillId: "basic_sword",
      skills: {},
      maxLevel: 100,
      attempts: 5,
    });
    expect(res.attempts).toBe(5);
    expect(res.qiSpent).toBeGreaterThan(0);
    expect(res.skills.basic_sword).toMatchObject({ level: 2, practicePoints: 2 });
    expect(res.levelsGained).toBe(2);
  });

  it("气不足立即停止；满级停止", () => {
    const noQi = settlePractice({
      params: PARAMS,
      qi: 0,
      skillId: "basic_sword",
      skills: {},
      maxLevel: 100,
      attempts: 5,
    });
    expect(noQi.attempts).toBe(0);
    expect(noQi.qiSpent).toBe(0);

    const maxed = settlePractice({
      params: PARAMS,
      qi: 500,
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

describe("settleDazuo / settleTuna", () => {
  it("打坐吐纳可累积资源", () => {
    const dz = settleDazuo({
      params: PARAMS,
      qi: 120,
      neili: 10,
      maxNeili: 100,
      forceLevel: 20,
      attempts: 3,
    });
    expect(dz.attempts).toBe(3);
    expect(dz.qiSpent).toBeGreaterThan(0);
    expect(dz.neiliGained).toBeGreaterThan(0);

    const tn = settleTuna({
      params: PARAMS,
      jing: 120,
      jingli: 10,
      maxJingli: 80,
      forceLevel: 20,
      attempts: 3,
    });
    expect(tn.attempts).toBe(3);
    expect(tn.jingSpent).toBeGreaterThan(0);
    expect(tn.jingliGained).toBeGreaterThan(0);
  });
});
