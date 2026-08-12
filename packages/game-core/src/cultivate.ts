import { evalFormulaWithCoeffs, type CompiledMechanics } from "@yjh/content";
import { DEFAULT_MECHANICS, type GameParams } from "./params.js";

/**
 * DC-054 离线修炼：打坐（气→内力）/ 吐纳（精→精力）。
 * 公式对齐 pkuxkx exercise.c / respirate.c 简化版。
 */

export function exerciseGainPerTick(
  params: GameParams,
  forceLevel: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return Math.max(
    1,
    Math.floor(evalFormulaWithCoeffs(mechanics, params, "exerciseGain", { forceLevel })),
  );
}

export function respirateGainPerTick(
  params: GameParams,
  forceLevel: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  return Math.max(
    1,
    Math.floor(evalFormulaWithCoeffs(mechanics, params, "respirateGain", { forceLevel })),
  );
}

export interface ExerciseOnceInput {
  params: GameParams;
  qi: number;
  neili: number;
  maxNeili: number;
  forceLevel: number;
  mechanics?: CompiledMechanics;
}

export type ExerciseOnceResult =
  | {
      ok: true;
      qiSpent: number;
      neiliGained: number;
      maxNeiliUp: number;
      neili: number;
      maxNeili: number;
    }
  | { ok: false; reason: "qi" | "max_neili"; neili: number; maxNeili: number };

/** 打坐一次：耗气，加内力；满溢可抬 maxNeili（对齐 pkuxkx 结构）。 */
export function exerciseOnce(input: ExerciseOnceInput): ExerciseOnceResult {
  const { params } = input;
  const mechanics = input.mechanics ?? DEFAULT_MECHANICS;
  const cost = params.afk.exerciseQiBase;
  if (input.qi < cost) {
    return { ok: false, reason: "qi", neili: input.neili, maxNeili: input.maxNeili };
  }
  const gain = exerciseGainPerTick(params, input.forceLevel, mechanics);
  let neili = input.neili + gain;
  let maxNeili = input.maxNeili;
  let maxNeiliUp = 0;
  const overflow = maxNeili * params.afk.cultivateMaxOverflowMult;
  if (neili >= overflow && maxNeili > 0) {
    maxNeiliUp = 1;
    maxNeili += 1;
    neili = maxNeili;
  }
  return {
    ok: true,
    qiSpent: cost,
    neiliGained: gain,
    maxNeiliUp,
    neili,
    maxNeili,
  };
}

export interface RespirateOnceInput {
  params: GameParams;
  jing: number;
  jingli: number;
  maxJingli: number;
  forceLevel: number;
  mechanics?: CompiledMechanics;
}

export type RespirateOnceResult =
  | {
      ok: true;
      jingSpent: number;
      jingliGained: number;
      maxJingliUp: number;
      jingli: number;
      maxJingli: number;
    }
  | { ok: false; reason: "jing" | "max_jingli"; jingli: number; maxJingli: number };

/** 吐纳一次：耗精，加精力；满溢可抬 maxJingli。 */
export function respirateOnce(input: RespirateOnceInput): RespirateOnceResult {
  const { params } = input;
  const mechanics = input.mechanics ?? DEFAULT_MECHANICS;
  const cost = params.afk.respirateJingBase;
  if (input.jing < cost) {
    return { ok: false, reason: "jing", jingli: input.jingli, maxJingli: input.maxJingli };
  }
  const gain = respirateGainPerTick(params, input.forceLevel, mechanics);
  let jingli = input.jingli + gain;
  let maxJingli = input.maxJingli;
  let maxJingliUp = 0;
  const overflow = maxJingli * params.afk.cultivateMaxOverflowMult;
  if (jingli >= overflow && maxJingli > 0) {
    maxJingliUp = 1;
    maxJingli += 1;
    jingli = maxJingli;
  }
  return {
    ok: true,
    jingSpent: cost,
    jingliGained: gain,
    maxJingliUp,
    jingli,
    maxJingli,
  };
}

/** 读取练功/打坐/吐纳每小时次数（兼容旧 studyAttemptsPerHour）。 */
export function afkAttemptsPerHour(
  params: GameParams,
  kind: "practice" | "dazuo" | "tuna" | "study",
): number {
  const afk = params.afk;
  if (kind === "practice" || kind === "study") {
    return afk.practiceAttemptsPerHour ?? afk.studyAttemptsPerHour ?? 12;
  }
  if (kind === "dazuo") return afk.dazuoAttemptsPerHour ?? 12;
  return afk.tunaAttemptsPerHour ?? 12;
}
