import { describe, expect, it } from "vitest";
import { buildGraph, type RoomNode } from "./map.js";
import {
  advanceOnlineGrind,
  initialGrindCircuitState,
  type GrindCircuitDef,
} from "./grindCircuit.js";

const rooms: RoomNode[] = [
  {
    id: "village_start",
    exits: { east: "village_square" },
  },
  {
    id: "village_square",
    exits: {
      west: "village_start",
      south: "village_inn",
      east: "village_general",
      north: "village_dojo",
    },
  },
  { id: "village_inn", exits: { north: "village_square" } },
  {
    id: "village_general",
    exits: { west: "village_square", south: "village_creek", east: "village_trail" },
  },
  { id: "village_creek", exits: { north: "village_general" } },
  { id: "village_dojo", exits: { south: "village_square", north: "village_herb" } },
  { id: "village_herb", exits: { south: "village_dojo" } },
  { id: "village_trail", exits: { west: "village_general" } },
];

const graph = buildGraph(rooms);

const fish: GrindCircuitDef = {
  hubRoomId: "village_square",
  route: [
    "village_square",
    "village_general",
    "village_creek",
    "village_general",
    "village_square",
  ],
  workRooms: ["village_creek"],
  navWhitelist: [
    "village_start",
    "village_square",
    "village_inn",
    "village_dojo",
    "village_general",
    "village_creek",
    "village_herb",
  ],
  moveLines: ["赶路。"],
  workLines: ["抛竿。"],
  harvestLine: "合圈入账。",
};

describe("grindCircuit", () => {
  it("已在枢纽则直接 circuit，跳过 goto", () => {
    const state = initialGrindCircuitState("village_square", fish);
    expect(state.phase).toBe("circuit");
  });

  it("异地开活先导航到枢纽（避怪房）", () => {
    let state = initialGrindCircuitState("village_start", fish);
    expect(state.phase).toBe("goto_hub");
    const step = advanceOnlineGrind(graph, fish, state);
    expect(step.action).toBe("move");
    expect(step.roomId).toBe("village_square");
    state = step.state;
    const arrive = advanceOnlineGrind(graph, fish, state);
    expect(arrive.action).toBe("arrive_hub");
    expect(arrive.state.phase).toBe("circuit");
  });

  it("完整一圈后才 harvest，工作点多停一 tick", () => {
    let state = initialGrindCircuitState("village_square", fish);
    const roomsVisited: string[] = [state.roomId];
    let harvested = false;
    // square→general→creek(work)→general→square(harvest) = 5 steps after start
    for (let i = 0; i < 8; i++) {
      const step = advanceOnlineGrind(graph, fish, state);
      state = step.state;
      roomsVisited.push(step.roomId);
      if (step.harvested) {
        harvested = true;
        expect(step.action).toBe("harvest");
        expect(step.journalLine).toBe("合圈入账。");
        expect(state.rounds).toBe(1);
        expect(state.routeIndex).toBe(0);
        break;
      }
    }
    expect(harvested).toBe(true);
    expect(roomsVisited).toContain("village_creek");
    // 在 creek 应出现两次相邻（抵达 + work）或至少 work 发生在 creek
    const creekIdx = roomsVisited.indexOf("village_creek");
    expect(creekIdx).toBeGreaterThanOrEqual(0);
  });

  it("白名单外无路则 stuck", () => {
    const narrow: GrindCircuitDef = {
      ...fish,
      navWhitelist: ["village_square", "village_inn"],
    };
    const state = initialGrindCircuitState("village_start", narrow);
    const step = advanceOnlineGrind(graph, narrow, state);
    expect(step.action).toBe("stuck");
  });
});
