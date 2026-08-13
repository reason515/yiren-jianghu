import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_MASTERY_LABELS,
  SKILL_MASTERY_LABELS,
  masteryBand,
  skillMastery,
} from "./skillMastery.js";

describe("skillMastery", () => {
  it("武学按 level/30 取档，文案与 pkuxkx 表一致", () => {
    expect(skillMastery(0).label).toBe("不堪一击");
    expect(skillMastery(29).label).toBe("不堪一击");
    expect(skillMastery(30).label).toBe("毫不足虑");
    expect(skillMastery(150).label).toBe("初窥门径"); // 150/30=5
    expect(skillMastery(390).label).toBe("马马虎虎"); // 13
    expect(skillMastery(420).label).toBe("略有小成"); // 14
    expect(SKILL_MASTERY_LABELS).toHaveLength(50);
    expect(skillMastery(10_000).grade).toBe(49);
    expect(skillMastery(10_000).label).toBe("返璞归真");
  });

  it("知识按 level/50 取档", () => {
    expect(skillMastery(0, "knowledge").label).toBe("新学乍用");
    expect(skillMastery(49, "knowledge").label).toBe("新学乍用");
    expect(skillMastery(50, "knowledge").label).toBe("初窥门径");
    expect(skillMastery(200, "knowledge").label).toBe("马马虎虎");
    expect(KNOWLEDGE_MASTERY_LABELS).toHaveLength(16);
    expect(skillMastery(10_000, "knowledge").label).toBe("深不可测");
  });

  it("band 落在 1..6", () => {
    expect(masteryBand(0, 50)).toBe(1);
    expect(masteryBand(49, 50)).toBe(6);
    expect(skillMastery(0).band).toBe(1);
    expect(skillMastery(10_000).band).toBe(6);
    expect(skillMastery(0, "knowledge").band).toBe(1);
    expect(skillMastery(10_000, "knowledge").band).toBe(6);
  });
});
