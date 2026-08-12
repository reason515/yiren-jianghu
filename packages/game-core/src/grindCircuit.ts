/**
 * DC-045 在线生计跑图状态机（纯函数）。
 * 先白名单导航到枢纽，再沿 route 逐步移动；合圈才标记 harvest。
 */

import { findPathInWhitelist, type RoomGraph } from "./map.js";

export type GrindOnlinePhase = "goto_hub" | "circuit";

export interface GrindCircuitDef {
  hubRoomId: string;
  route: string[];
  workRooms: string[];
  navWhitelist: string[];
  moveLines?: string[];
  workLines?: string[];
  harvestLine?: string;
  onlineLines?: string[];
}

export interface GrindCircuitState {
  phase: GrindOnlinePhase;
  /** 当前所在房间（与 characters.room_path 同步）。 */
  roomId: string;
  /** circuit：当前位于 route[routeIndex]。 */
  routeIndex: number;
  /** 到达工作点后剩余干活 tick（通常 0 或 1）。 */
  pendingWork: number;
  rounds: number;
  /** 见闻轮换游标。 */
  lineSeq: number;
}

export type GrindCircuitAction = "arrive_hub" | "move" | "work" | "harvest" | "stuck";

export interface GrindCircuitStep {
  state: GrindCircuitState;
  action: GrindCircuitAction;
  /** 本步后房间（可能与步进前相同，如 work/harvest）。 */
  roomId: string;
  journalLine: string;
  /** 合圈发奖。 */
  harvested: boolean;
}

function pickLine(lines: string[] | undefined, fallback: string, seq: number): string {
  const pool = lines && lines.length > 0 ? lines : [fallback];
  return pool[seq % pool.length]!;
}

export function initialGrindCircuitState(roomId: string, def: GrindCircuitDef): GrindCircuitState {
  const atHub = roomId === def.hubRoomId;
  return {
    phase: atHub ? "circuit" : "goto_hub",
    roomId,
    routeIndex: 0,
    pendingWork: 0,
    rounds: 0,
    lineSeq: 0,
  };
}

/**
 * 推进在线生计一步。调用方负责写 room_path 与合圈发奖。
 */
export function advanceOnlineGrind(
  graph: RoomGraph,
  def: GrindCircuitDef,
  state: GrindCircuitState,
): GrindCircuitStep {
  if (state.phase === "goto_hub") {
    if (state.roomId === def.hubRoomId) {
      const lineSeq = state.lineSeq + 1;
      return {
        state: {
          ...state,
          phase: "circuit",
          routeIndex: 0,
          pendingWork: 0,
          lineSeq,
        },
        action: "arrive_hub",
        roomId: def.hubRoomId,
        journalLine: "你赶到村口广场，放下行囊，准备开干。",
        harvested: false,
      };
    }
    const whitelist = new Set(def.navWhitelist);
    const path = findPathInWhitelist(graph, state.roomId, def.hubRoomId, whitelist);
    if (!path.ok || path.path.length === 0) {
      return {
        state,
        action: "stuck",
        roomId: state.roomId,
        journalLine: "前路不通，这趟杂役只好暂且搁下。",
        harvested: false,
      };
    }
    const next = path.path[0]!.to;
    const lineSeq = state.lineSeq + 1;
    return {
      state: {
        ...state,
        roomId: next,
        lineSeq,
      },
      action: "move",
      roomId: next,
      journalLine: pickLine(def.moveLines, "你循着熟悉的小路又挪了一步。", state.lineSeq),
      harvested: false,
    };
  }

  // circuit
  if (state.pendingWork > 0) {
    const pendingWork = state.pendingWork - 1;
    const lineSeq = state.lineSeq + 1;
    return {
      state: { ...state, pendingWork, lineSeq },
      action: "work",
      roomId: state.roomId,
      journalLine: pickLine(
        def.workLines?.length ? def.workLines : def.onlineLines,
        "手头又忙过一阵。",
        state.lineSeq,
      ),
      harvested: false,
    };
  }

  const route = def.route;
  if (route.length < 2) {
    return {
      state,
      action: "stuck",
      roomId: state.roomId,
      journalLine: "这桩杂役路线未定，无法开干。",
      harvested: false,
    };
  }

  if (state.routeIndex >= route.length - 1) {
    // 已在终点 hub：合圈发奖后重置下一圈
    const lineSeq = state.lineSeq + 1;
    const rounds = state.rounds + 1;
    return {
      state: {
        ...state,
        routeIndex: 0,
        pendingWork: 0,
        rounds,
        lineSeq,
        roomId: def.hubRoomId,
      },
      action: "harvest",
      roomId: def.hubRoomId,
      journalLine:
        def.harvestLine ??
        pickLine(def.onlineLines, "这一趟忙完，碎银与历练入了囊中。", state.lineSeq),
      harvested: true,
    };
  }

  const nextIndex = state.routeIndex + 1;
  const nextRoom = route[nextIndex]!;
  const workSet = new Set(def.workRooms);
  const pendingWork = workSet.has(nextRoom) ? 1 : 0;
  const lineSeq = state.lineSeq + 1;
  const arrivedEnd = nextIndex >= route.length - 1;

  if (arrivedEnd) {
    // 走回枢纽：本步移动并合圈发奖
    const rounds = state.rounds + 1;
    return {
      state: {
        ...state,
        roomId: nextRoom,
        routeIndex: 0,
        pendingWork: 0,
        rounds,
        lineSeq,
      },
      action: "harvest",
      roomId: nextRoom,
      journalLine:
        def.harvestLine ??
        pickLine(def.onlineLines, "这一趟忙完，碎银与历练入了囊中。", state.lineSeq),
      harvested: true,
    };
  }

  return {
    state: {
      ...state,
      roomId: nextRoom,
      routeIndex: nextIndex,
      pendingWork,
      lineSeq,
    },
    action: "move",
    roomId: nextRoom,
    journalLine: pickLine(def.moveLines, "你循着熟悉的小路又挪了一步。", state.lineSeq),
    harvested: false,
  };
}

/** 从枢纽出发跑完一圈所需的步数（含干活 tick），用于按比例发奖。 */
export function circuitStepsTotal(def: GrindCircuitDef): number {
  const route = def.route;
  if (route.length < 2) return 1;
  const workSet = new Set(def.workRooms);
  let steps = 0;
  for (let i = 0; i < route.length - 1; i++) {
    steps += 1;
    if (workSet.has(route[i + 1]!)) steps += 1;
  }
  return Math.max(1, steps);
}
