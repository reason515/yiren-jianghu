/** 主线节点按 next 链排序（DC-055：避免按文件名把「入城」排到「初入江湖」前）。 */

export interface StoryChainNode {
  id: string;
  next?: readonly string[];
}

export function orderStoryByNextChain<T extends StoryChainNode>(nodes: readonly T[]): T[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set<string>();
  for (const node of nodes) {
    for (const id of node.next ?? []) incoming.add(id);
  }
  const roots = nodes.filter((node) => !incoming.has(node.id));
  const reachableCount = (start: T): number => {
    const seen = new Set<string>();
    const queue = [start.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (!node) continue;
      for (const next of node.next ?? []) queue.push(next);
    }
    return seen.size;
  };
  const start = [...roots].sort((a, b) => reachableCount(b) - reachableCount(a))[0] ?? nodes[0]!;
  const out: T[] = [];
  const seen = new Set<string>();
  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    seen.add(id);
    out.push(node);
    for (const next of node.next ?? []) queue.push(next);
  }
  for (const node of nodes) {
    if (!seen.has(node.id)) out.push(node);
  }
  return out;
}
