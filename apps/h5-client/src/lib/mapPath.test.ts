import { describe, expect, it } from "vitest";
import { bfsRoomPath } from "./mapPath.js";

const EDGES = [
  { from: "village_square", to: "village_general" },
  { from: "village_general", to: "village_trail" },
  { from: "village_square", to: "village_start" },
];

describe("bfsRoomPath", () => {
  it("村口到小径两步：广场→杂货铺→小径", () => {
    expect(bfsRoomPath("village_square", "village_trail", EDGES)).toEqual([
      "village_general",
      "village_trail",
    ]);
  });

  it("已在目标返回空路径；不可达返回 null", () => {
    expect(bfsRoomPath("village_square", "village_square", EDGES)).toEqual([]);
    expect(bfsRoomPath("village_square", "city_gate", EDGES)).toBeNull();
  });
});
