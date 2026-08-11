import { describe, expect, it } from "vitest";
import { formatExertCost, toFieldExertOptions } from "./fieldExert.js";

describe("fieldExert", () => {
  it("只保留场外可用绝招", () => {
    const opts = toFieldExertOptions([
      { id: "slash", name: "疾风斩", skillId: "s", fieldKind: null },
      {
        id: "cure_wound",
        name: "玄门疗伤",
        skillId: "f",
        fieldKind: "cure",
        cost: { qi: 0, jing: 5, neili: 20 },
      },
    ]);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.id).toBe("cure_wound");
  });

  it("格式化消耗", () => {
    expect(formatExertCost({ qi: 0, jing: 5, neili: 20 })).toBe("内力 20 · 精 5");
    expect(formatExertCost({ qi: 0, jing: 0, neili: 0 })).toBe("无额外消耗");
  });
});
