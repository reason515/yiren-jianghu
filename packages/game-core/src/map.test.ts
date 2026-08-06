import { describe, expect, it } from "vitest";
import { buildGraph, findPath, findPathInWhitelist, inWhitelist, type RoomNode } from "./map.js";

/** 新手村 → 主城迷你图：
 *   village → road_a → road_b → city；village 旁有 locked_hut（门关着）。 */
const ROOMS: RoomNode[] = [
  { id: "village", exits: { south: "road_a", west: "locked_hut" }, blockedDirs: ["west"] },
  { id: "road_a", exits: { north: "village", south: "road_b" } },
  { id: "road_b", exits: { north: "road_a", south: "city", east: "bandit_camp" } },
  { id: "city", exits: { north: "road_b" } },
  { id: "locked_hut", exits: { east: "village" } },
  { id: "bandit_camp", exits: { west: "road_b" } },
];

const GRAPH = buildGraph(ROOMS);

describe("buildGraph", () => {
  it("关着的门（blockedDirs）不生成边", () => {
    expect(GRAPH.get("village")?.some((e) => e.dir === "west")).toBe(false);
    expect(GRAPH.get("village")?.some((e) => e.dir === "south")).toBe(true);
  });
});

describe("findPath（BFS）", () => {
  it("多跳路径：village → city", () => {
    const r = findPath(GRAPH, "village", "city");
    expect(r).toEqual({
      ok: true,
      path: [
        { dir: "south", to: "road_a" },
        { dir: "south", to: "road_b" },
        { dir: "south", to: "city" },
      ],
    });
  });

  it("同房间 → 空路径", () => {
    expect(findPath(GRAPH, "city", "city")).toEqual({ ok: true, path: [] });
  });

  it("门关闭的出口不可达（locked_hut 只能从 village 进，但 village→west 被挡）", () => {
    const r = findPath(GRAPH, "village", "locked_hut");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_route");
  });

  it("未知房间 → 明确原因", () => {
    expect(findPath(GRAPH, "ghost", "city")).toMatchObject({ ok: false, reason: "unknown_start" });
    expect(findPath(GRAPH, "village", "ghost")).toMatchObject({
      ok: false,
      reason: "unknown_target",
    });
  });

  it("确定性：多次调用结果一致", () => {
    expect(findPath(GRAPH, "village", "city")).toEqual(findPath(GRAPH, "village", "city"));
  });
});

describe("findPathInWhitelist（挂机白名单）", () => {
  it("白名单覆盖全部途经房间 → 可达", () => {
    const white = new Set(["village", "road_a", "road_b", "city"]);
    const r = findPathInWhitelist(GRAPH, "village", "city", white);
    expect(r.ok).toBe(true);
  });

  it("途经房间不在白名单 → 不可达（吸收 xkx 白名单教训）", () => {
    const white = new Set(["village", "city"]); // road_a/road_b 不在白名单
    const r = findPathInWhitelist(GRAPH, "village", "city", white);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_route");
  });

  it("起点/终点不在白名单 → 不可达", () => {
    const white = new Set(["village", "road_a", "road_b"]);
    expect(findPathInWhitelist(GRAPH, "village", "city", white)).toMatchObject({ ok: false });
  });

  it("主动攻击怪房间可被白名单天然避让", () => {
    // bandit_camp 不在白名单 → 经 road_b 的路线不受影响；若要从 village 去 bandit_camp 则不可达
    const white = new Set(["village", "road_a", "road_b", "city"]);
    expect(findPathInWhitelist(GRAPH, "village", "bandit_camp", white)).toMatchObject({
      ok: false,
    });
  });
});

describe("inWhitelist", () => {
  it("判定单个房间是否在白名单", () => {
    const white = new Set(["city"]);
    expect(inWhitelist(white, "city")).toBe(true);
    expect(inWhitelist(white, "village")).toBe(false);
  });
});
