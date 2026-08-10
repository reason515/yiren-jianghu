import { describe, expect, it } from "vitest";
import { acquiredAttrs, attrLevelsFromSkills } from "./attrs.js";

describe("acquiredAttrs（DC-047）", () => {
  it("force/10→con、dodge/10→dex、unarmed/10→str、knowledge/10→int", () => {
    const cur = acquiredAttrs(
      { str: 20, int: 20, con: 20, dex: 20 },
      { force: 25, dodge: 18, unarmed: 12, knowledge: 30 },
    );
    expect(cur).toEqual({ str: 21, int: 23, con: 22, dex: 21 });
  });

  it("等级不足 10 不加成", () => {
    expect(
      acquiredAttrs(
        { str: 15, int: 15, con: 15, dex: 15 },
        {
          force: 9,
          dodge: 9,
          unarmed: 9,
          knowledge: 9,
        },
      ),
    ).toEqual({ str: 15, int: 15, con: 15, dex: 15 });
  });
});

describe("attrLevelsFromSkills", () => {
  it("knowledge 取最高原级；其余用有效等级", () => {
    const levels = attrLevelsFromSkills(
      [
        { category: "knowledge", level: 10 },
        { category: "knowledge", level: 40 },
        { category: "force", level: 99 },
      ],
      { force: 30, dodge: 20, unarmed: 15 },
    );
    expect(levels).toEqual({ force: 30, dodge: 20, unarmed: 15, knowledge: 40 });
  });
});
