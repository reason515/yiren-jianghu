import { describe, expect, it } from "vitest";
import { buildCharacterLook } from "./characterLook.js";

describe("buildCharacterLook", () => {
  it("拼装性别、武功水平与衣着兵器", () => {
    const lines = buildCharacterLook({
      name: "陆小风",
      gender: "male",
      skills: [{ level: 0 }, { level: 12 }],
      equipment: [
        { slot: "weapon", item: { name: "铁剑" } },
        { slot: "armor", item: { name: "粗布衣" } },
      ],
    });
    expect(lines[0]).toContain("男子");
    expect(lines[0]).toContain("陆小风");
    expect(lines[1]).toContain("初窥门径");
    expect(lines[2]).toContain("粗布衣");
    expect(lines[3]).toContain("铁剑");
  });

  it("无武功无衣甲时给出空态表述", () => {
    const lines = buildCharacterLook({
      name: "阿朱",
      gender: "female",
      skills: [{ level: 0 }],
      equipment: [{ slot: "weapon" }, { slot: "armor" }],
    });
    expect(lines[0]).toContain("女子");
    expect(lines[1]).toContain("尚未入门");
    expect(lines[2]).toContain("未着衣甲");
    expect(lines[3]).toContain("未佩兵器");
  });
});
