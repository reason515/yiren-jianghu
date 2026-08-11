import type { Move } from "@yjh/content";
import type { Rng } from "./random.js";

/**
 * C11 普攻/身法招式抽选（DC-041 / DC-053）。
 * 从「已解锁 + 挂在已激发特殊功上」的招式中随机抽一式；无可用招式则返回 null。
 * 可选 `skillIds` 限定攻击槽或身法槽，避免佩剑抽到拳脚、或攻击抽到身法。
 */
export interface PickMoveOptions {
  moves: Move[];
  /** 已解锁（原级达门槛）的招式 id 集合。 */
  learnedMoveIds: Set<string>;
  /** 当前已激发的特殊功 id 列表（各槽位激发图的 value 集合）。 */
  enabledSpecialIds: string[];
  /**
   * 若提供且非空，仅从这些 skillId 中抽（如攻击槽 `[enableMap.sword]`、
   * 身法槽 `[enableMap.dodge]`）。
   */
  skillIds?: string[];
  rng: Rng;
}

export function pickMove(opts: PickMoveOptions): Move | null {
  const skillFilter =
    opts.skillIds && opts.skillIds.length > 0 ? new Set(opts.skillIds) : undefined;
  const candidates = opts.moves.filter((move) => {
    if (!opts.learnedMoveIds.has(move.id)) return false;
    if (!opts.enabledSpecialIds.includes(move.skillId)) return false;
    if (skillFilter && !skillFilter.has(move.skillId)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const index = Math.min(Math.floor(opts.rng() * candidates.length), candidates.length - 1);
  return candidates[index]!;
}
