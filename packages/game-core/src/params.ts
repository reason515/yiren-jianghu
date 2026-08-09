import {
  defaultCompiledMechanics,
  evalFormulaWithCoeffs,
  paramsSchema,
  type CompiledMechanics,
  type Params,
} from "@yjh/content";

/**
 * C1 / DC-046 数值参数与公式模块。
 *
 * - 系数 Schema 与公式 DSL 的单一来源在 @yjh/content（mechanics.yaml）。
 * - 本模块提供装载、DEFAULT 与派生求值；公式形状不再写死在 TS。
 */

export type GameParams = Params;
export type { CompiledMechanics };

/** 开发默认系数，与 packages/content/fixtures/pack/mechanics.yaml coeffs 保持一致。 */
export const DEFAULT_PARAMS: GameParams = structuredClone(defaultCompiledMechanics().coeffs);

/** 默认编译机制（公式+分段）；生产环境优先用 loadContentDir().pack.compiled。 */
export function defaultMechanics(): CompiledMechanics {
  return defaultCompiledMechanics();
}

export const DEFAULT_MECHANICS: CompiledMechanics = defaultCompiledMechanics();

/** 升到下一级所需经验：公式 expForNextLevel。 */
export function expForNextLevel(
  p: GameParams,
  level: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level 必须是不小于 1 的整数");
  return Math.round(evalFormulaWithCoeffs(mechanics, p, "expForNextLevel", { level }));
}

/** 有效潜能 = potential − learned_points（已定修正，下限 0）。 */
export function effectivePotential(potential: number, learnedPoints: number): number {
  return Math.max(0, potential - learnedPoints);
}

/**
 * 挂机每日递减乘数（0 ≤ 返回值 ≤ 1）。
 * 公式 diminishMultiplier；fullCycles 由本函数按 coeffs 预计算。
 */
export function diminishMultiplier(
  p: GameParams,
  hoursUsedToday: number,
  mechanics: CompiledMechanics = DEFAULT_MECHANICS,
): number {
  if (hoursUsedToday < 0) throw new RangeError("hoursUsedToday 必须 >= 0");
  const fullCycles = Math.floor(hoursUsedToday / p.afk.maxDurationHours);
  return evalFormulaWithCoeffs(mechanics, p, "diminishMultiplier", {
    hoursUsedToday,
    fullCycles,
  });
}

export type ParseParamsResult = { ok: true; params: GameParams } | { ok: false; errors: string[] };

/** 装载参数表（mechanics.coeffs / 旧 params.json → 校验 → GameParams）。 */
export function parseParams(input: unknown): ParseParamsResult {
  const result = paramsSchema.safeParse(input);
  if (result.success) return { ok: true, params: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
