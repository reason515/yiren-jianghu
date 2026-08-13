/** 舆图无向边 BFS：返回起点之后的房间 id 序列（不含起点）。 */

export interface MapPathEdge {
  from: string;
  to: string;
}

export function bfsRoomPath(
  from: string,
  to: string,
  edges: readonly MapPathEdge[],
): string[] | null {
  if (from === to) return [];
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.from)!.push(edge.to);
    adj.get(edge.to)!.push(edge.from);
  }
  if (!adj.has(from) || !adj.has(to)) return null;

  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: string[] = [];
        let node = to;
        while (node !== from) {
          path.unshift(node);
          node = prev.get(node)!;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
