import type { Move } from "@yjh/content";
import type { Rng } from "./random.js";

/**
 * C11 普攻招式抽选（DC-041）。
 * 普攻时从「已解锁 + 挂在已激发特殊功上」的招式中随机抽一式；无可用招式则返回 null
 * （调用方落回纯基础攻击）。
 */
export interface PickMoveOptions {
  moves: Move[];
  /** 已解锁（原级达门槛）的招式 id 集合。 */
  learnedMoveIds: Set<string>;
  /** 当前已激发的特殊功 id 列表（各槽位激发图的 value 集合）。 */
  enabledSpecialIds: string[];
  rng: Rng;
}

export function pickMove(opts: PickMoveOptions): Move | null {
  const candidates = opts.moves.filter(
    (move) => opts.learnedMoveIds.has(move.id) && opts.enabledSpecialIds.includes(move.skillId),
  );
  if (candidates.length === 0) return null;
  const index = Math.min(Math.floor(opts.rng() * candidates.length), candidates.length - 1);
  return candidates[index]!;
}
