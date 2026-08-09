import type { EnableSlot, Move, SkillCategory } from "@yjh/content";

/**
 * C11 基本功/特殊功激发（DC-041）。
 *
 * - 基本功（kind=basic）即门类本身（force/dodge/parry/unarmed/sword/blade）；
 * - 特殊功（kind=special）可挂到 enableSlots 声明的槽位上，取代该槽位的展示等级；
 * - 有效等级 = floor(基本功原级 / 2) + 已激发特殊功原级（无激发则该项为 0），
 *   对齐 xkx combat/probable.h 的 `ob->query_skill(skill,1)/2 + ob->query_skill(askill,1)`；
 * - knowledge 技能仅展示/门槛用，不参与激发。
 */

export { type EnableSlot };

export const ENABLE_SLOTS: readonly EnableSlot[] = [
  "force",
  "dodge",
  "parry",
  "unarmed",
  "sword",
  "blade",
];

/** 槽位 → 已激发特殊功 id；缺省表示该槽无特殊功激发，仅用基本功。 */
export type SkillEnableMap = Partial<Record<EnableSlot, string>>;

/** 内容包技能定义 + 角色原始等级的合并视图（enable.ts 各函数的统一入参）。 */
export interface SkillRaw {
  id: string;
  level: number;
  kind: "basic" | "special";
  category: SkillCategory;
  enableSlots: EnableSlot[];
}

export type SkillRawMap = Map<string, SkillRaw> | Record<string, SkillRaw>;

function normalizeSkillMap(skills: SkillRawMap): Map<string, SkillRaw> {
  return skills instanceof Map ? skills : new Map(Object.entries(skills));
}

/**
 * 槽位对应的基本功 id：优先在技能定义中找 `kind=basic && category===slot`，
 * 找不到则回退 `basic_${slot}` 命名约定（内容包尚未收录该槽基本功时的占位）。
 */
export function basicSkillIdForSlot(slot: EnableSlot, skillDefs?: Iterable<SkillRaw>): string {
  if (skillDefs) {
    for (const def of skillDefs) {
      if (def.kind === "basic" && def.category === slot) return def.id;
    }
  }
  return `basic_${slot}`;
}

/**
 * 槽位有效等级 = floor(基本功原级/2) + 已激发特殊功原级（无激发为 0）。
 * 全部使用角色原始（raw）等级，不做二次派生。
 */
export function effectiveLevel(
  slot: EnableSlot,
  skills: SkillRawMap,
  enableMap: SkillEnableMap,
): number {
  const map = normalizeSkillMap(skills);
  const basicId = basicSkillIdForSlot(slot, map.values());
  const basicLevel = map.get(basicId)?.level ?? 0;
  const specialId = enableMap[slot];
  const specialLevel = specialId ? (map.get(specialId)?.level ?? 0) : 0;
  return Math.floor(basicLevel / 2) + specialLevel;
}

export type EnableErrorCode = "not_learned" | "not_special" | "slot_not_allowed";

export class EnableError extends Error {
  readonly code: EnableErrorCode;
  constructor(code: EnableErrorCode, message: string) {
    super(message);
    this.name = "EnableError";
    this.code = code;
  }
}

/** 校验某特殊功是否可挂到指定槽位；不满足条件抛 EnableError。 */
export function assertCanEnable(slot: EnableSlot, skillId: string, skills: SkillRawMap): void {
  const map = normalizeSkillMap(skills);
  const skill = map.get(skillId);
  if (!skill || skill.level <= 0) {
    throw new EnableError("not_learned", `尚未习得 ${skillId}，无法激发`);
  }
  if (skill.kind !== "special") {
    throw new EnableError("not_special", `${skillId} 非特殊功，不可激发`);
  }
  if (!skill.enableSlots.includes(slot)) {
    throw new EnableError("slot_not_allowed", `${skillId} 不可激发槽位 ${slot}`);
  }
}

/**
 * 自动激发图：每个槽位挑选「已学、可激发该槽位、原级最高」的特殊功；
 * 同级按 id 字典序取最小（确定性）。无可用特殊功的槽位不进图（走纯基本功）。
 */
export function autoEnableMap(skills: SkillRawMap): SkillEnableMap {
  const map = normalizeSkillMap(skills);
  const result: SkillEnableMap = {};
  for (const slot of ENABLE_SLOTS) {
    let best: SkillRaw | undefined;
    for (const skill of map.values()) {
      if (skill.kind !== "special" || skill.level <= 0) continue;
      if (!skill.enableSlots.includes(slot)) continue;
      if (!best || skill.level > best.level || (skill.level === best.level && skill.id < best.id)) {
        best = skill;
      }
    }
    if (best) result[slot] = best.id;
  }
  return result;
}

/** 某技能升到 newLevel 时已解锁的全部招式（minLevel ≤ newLevel）。 */
export function unlockedMoves(skillId: string, newLevel: number, allMoves: Move[]): Move[] {
  return allMoves.filter((move) => move.skillId === skillId && move.minLevel <= newLevel);
}

/** 由 oldLevel 升到 newLevel 这一步新解锁的招式（旧级未达门槛、新级已达）。 */
export function newlyUnlockedMoves(
  skillId: string,
  oldLevel: number,
  newLevel: number,
  moves: Move[],
): Move[] {
  return moves.filter(
    (move) => move.skillId === skillId && move.minLevel > oldLevel && move.minLevel <= newLevel,
  );
}
