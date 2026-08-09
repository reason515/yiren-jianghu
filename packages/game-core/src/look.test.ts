import { describe, expect, it } from "vitest";
import { buildNpcObserveLines, martialLevelLine } from "./look.js";

describe("martialLevelLine", () => {
  it("self / other 低阶与未入门表述不同", () => {
    expect(martialLevelLine(0, "self")).toContain("尚未入门");
    expect(martialLevelLine(0, "other")).toContain("看不出深浅");
    expect(martialLevelLine(10, "other")).toContain("初窥门径");
    expect(martialLevelLine(120, "other")).toContain("堂奥");
  });
});

describe("buildNpcObserveLines", () => {
  it("外形 + 武功 + 有装备时衣着兵器", () => {
    expect(
      buildNpcObserveLines({
        description: "见了生人先打量三眼。",
        kind: "battle",
        skillLevels: [10],
        gear: [
          { kind: "armor", name: "粗布衣" },
          { kind: "weapon", name: "铁剑" },
        ],
      }),
    ).toEqual([
      "见了生人先打量三眼。",
      "武功初窥门径，招式仍显生疏。",
      "身上穿着粗布衣。",
      "腰间悬着铁剑。",
    ]);
  });

  it("无技能战斗怪用野性补句，无装备不写空衣甲", () => {
    expect(
      buildNpcObserveLines({
        description: "灰毛土狗，呲着牙。",
        kind: "battle",
        skillLevels: [0],
        gear: [],
      }),
    ).toEqual(["灰毛土狗，呲着牙。", "看去并无精深功夫，只凭一身蛮力与野性。"]);
  });

  it("商贩无武学时气息寻常", () => {
    const lines = buildNpcObserveLines({
      description: "胖乎乎，笑呵呵。",
      kind: "vendor",
      skillLevels: [],
      gear: [],
    });
    expect(lines[1]).toContain("气息寻常");
  });
});
