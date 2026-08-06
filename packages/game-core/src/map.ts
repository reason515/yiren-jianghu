/**
 * C10 地图与导航（纯函数）。
 *
 * - 房间图：节点 = 房间 id，边 = 出口方向 → 目标房间；关着的门视为不可通行（blockedDirs）。
 * - 路径查找：BFS（确定性顺序），返回方向步序列；不可达返回明确原因。
 * - 挂机白名单：findPathInWhitelist 只允许途经白名单房间——吸收 xkx 教训：
 *   （1）find_path 要求 from/to 在 city_whitelist，否则永远不可达；
 *   （2）途经主动攻击怪房间会破坏"零战斗"挂机，需避让。
 */

export interface RoomNode {
  id: string;
  /** 出口：方向 → 目标房间 id。 */
  exits: Record<string, string>;
  /** 不可通行方向（关着的门/机关），导航跳过。 */
  blockedDirs?: string[];
}

export interface Edge {
  dir: string;
  to: string;
}

export type RoomGraph = ReadonlyMap<string, readonly Edge[]>;

export function buildGraph(rooms: RoomNode[]): RoomGraph {
  const graph = new Map<string, Edge[]>();
  for (const room of rooms) {
    const blocked = new Set(room.blockedDirs ?? []);
    const edges: Edge[] = Object.entries(room.exits)
      .filter(([dir]) => !blocked.has(dir))
      .map(([dir, to]) => ({ dir, to }));
    graph.set(room.id, edges);
  }
  return graph;
}

export interface MoveStep {
  dir: string;
  to: string;
}

export type PathResult =
  | { ok: true; path: MoveStep[] }
  | { ok: false; reason: "unknown_start" | "unknown_target" | "no_route" };

function bfs(
  graph: RoomGraph,
  from: string,
  to: string,
  allowed: (roomId: string) => boolean,
): PathResult {
  if (!graph.has(from)) return { ok: false, reason: "unknown_start" };
  if (!graph.has(to)) return { ok: false, reason: "unknown_target" };
  if (!allowed(from) || !allowed(to)) return { ok: false, reason: "no_route" };
  if (from === to) return { ok: true, path: [] };

  const queue: string[] = [from];
  const visited = new Set<string>([from]);
  const prev = new Map<string, { dir: string; from: string }>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const edge of graph.get(cur) ?? []) {
      if (visited.has(edge.to)) continue;
      if (!allowed(edge.to)) continue;
      visited.add(edge.to);
      prev.set(edge.to, { dir: edge.dir, from: cur });
      if (edge.to === to) {
        // 回溯路径
        const path: MoveStep[] = [];
        let node = to;
        while (node !== from) {
          const p = prev.get(node)!;
          path.unshift({ dir: p.dir, to: node });
          node = p.from;
        }
        return { ok: true, path };
      }
      queue.push(edge.to);
    }
  }
  return { ok: false, reason: "no_route" };
}

/** 全图可达性（无白名单限制）。 */
export function findPath(graph: RoomGraph, from: string, to: string): PathResult {
  return bfs(graph, from, to, () => true);
}

/** 只允许途经白名单房间（起点/终点也必须在白名单内，否则视为不可达）。 */
export function findPathInWhitelist(
  graph: RoomGraph,
  from: string,
  to: string,
  whitelist: ReadonlySet<string>,
): PathResult {
  return bfs(graph, from, to, (roomId) => whitelist.has(roomId));
}

/** 挂机目标白名单判定。 */
export function inWhitelist(whitelist: ReadonlySet<string>, roomId: string): boolean {
  return whitelist.has(roomId);
}
