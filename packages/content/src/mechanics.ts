import { z } from "zod";
import { collectIdents, compileExpr, evalAst, ExprError, type ExprAst } from "./expr.js";
import { paramsSchema, type Params } from "./schema.js";

/**
 * DC-046 机制配置：系数 + 命名公式 + 分段表 + 实体索引。
 * 公式注册表是引擎契约——yaml 必须覆盖全部 id。
 */

export const REQUIRED_FORMULA_IDS = [
  "expForNextLevel",
  "diminishMultiplier",
  "expGateRequired",
  "potentialCostForNext",
  "jingCostForLearn",
  "practiceCost",
  "practicePointsNeeded",
  "studyCost",
  "exerciseGain",
  "respirateGain",
  "maxNeili",
  "maxQi",
  "maxJing",
  "maxJingli",
  "maxFood",
  "maxWater",
  "attackDamageBase",
  "moveDamageApplied",
  "parryDamage",
  "scalePerformAmount",
  "expectedScore",
  "effectiveLevel",
  "skillPowerBase",
  "skillPowerWeighted",
  "combatantAttack",
  "combatantDefense",
  "combatantDodge",
  "combatantParry",
] as const;

export type FormulaId = (typeof REQUIRED_FORMULA_IDS)[number];

/** 可选分段表 id（小数值后不再强制；保留类型供扩展）。 */
export const OPTIONAL_PIECEWISE_IDS = ["levelCubePower", "combatExpBonus"] as const;
export type PiecewiseId = string;

/** 允许出现在公式中的额外运行时变量（非 coeffs 叶）。 */
export const RUNTIME_VARS = new Set([
  "level",
  "nextLevel",
  "hoursUsedToday",
  "fullCycles",
  "int",
  "isFirstLearn",
  "str",
  "dex",
  "con",
  "forceLevel",
  "weaponLevel",
  "atk",
  "def",
  "fullDamage",
  "moveDamage",
  "moveForce",
  "amount",
  "skillRawLevel",
  "scoreA",
  "scoreB",
  "basicLevel",
  "specialLevel",
  "combatExp",
  "expK",
  "seg",
  "cubePower",
  "expBonus",
  "usageIsAttack",
  "power",
  "weighted",
  "dodgeLevel",
  "parryLevel",
  "base",
]);

const piecewiseSegmentSchema = z.object({
  when: z.string().min(1),
  then: z.string().min(1),
});

export const mechanicsSchema = z.object({
  coeffs: paramsSchema,
  formulas: z.record(z.string().min(1)),
  piecewise: z.record(z.array(piecewiseSegmentSchema).min(1)).default({}),
  entityIndex: z
    .record(
      z.object({
        path: z.string().min(1),
        fields: z.array(z.string().min(1)).min(1),
        note: z.string().optional(),
      }),
    )
    .default({}),
});

export type MechanicsConfig = z.infer<typeof mechanicsSchema>;

export interface CompiledPiecewise {
  segments: { when: ExprAst; then: ExprAst }[];
}

export interface CompiledMechanics {
  coeffs: Params;
  /** 扁平 coeffs 叶节点，供公式绑定。 */
  flatCoeffs: Record<string, number>;
  formulas: Map<string, ExprAst>;
  piecewise: Map<string, CompiledPiecewise>;
  entityIndex: MechanicsConfig["entityIndex"];
  raw: MechanicsConfig;
}

/** 将嵌套 coeffs 展平为叶子名 → 数值（要求全包唯一叶名）。 */
export function flattenCoeffs(coeffs: Params): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (obj: unknown, prefix: string): void => {
    if (typeof obj === "number") {
      const key = prefix.includes(".") ? prefix.slice(prefix.lastIndexOf(".") + 1) : prefix;
      if (key in out && out[key] !== obj) {
        throw new ExprError(`coeffs 叶名冲突：${key}`);
      }
      out[key] = obj;
      return;
    }
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
    }
  };
  walk(coeffs, "");
  return out;
}

function assertIdentsKnown(ast: ExprAst, known: Set<string>, label: string): void {
  for (const id of collectIdents(ast)) {
    if (!known.has(id)) {
      throw new ExprError(`${label} 引用未知变量：${id}`);
    }
  }
}

export type CompileMechanicsResult =
  { ok: true; mechanics: CompiledMechanics } | { ok: false; errors: string[] };

export function compileMechanics(input: unknown): CompileMechanicsResult {
  const parsed = mechanicsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const raw = parsed.data;
  const errors: string[] = [];

  for (const id of REQUIRED_FORMULA_IDS) {
    if (!(id in raw.formulas)) errors.push(`缺少公式：${id}`);
  }
  for (const id of Object.keys(raw.formulas)) {
    if (!(REQUIRED_FORMULA_IDS as readonly string[]).includes(id)) {
      errors.push(`未知公式 id：${id}`);
    }
  }

  let flatCoeffs: Record<string, number>;
  try {
    flatCoeffs = flattenCoeffs(raw.coeffs);
  } catch (e) {
    return {
      ok: false,
      errors: [...errors, e instanceof Error ? e.message : String(e)],
    };
  }

  const known = new Set<string>([...Object.keys(flatCoeffs), ...RUNTIME_VARS]);
  // 分段 then 里可引用 seg / expK（在 when 求值后由调用方注入）
  known.add("seg");
  known.add("expK");

  const formulas = new Map<string, ExprAst>();
  for (const [id, src] of Object.entries(raw.formulas)) {
    try {
      const ast = compileExpr(src);
      assertIdentsKnown(ast, known, `formulas.${id}`);
      formulas.set(id, ast);
    } catch (e) {
      errors.push(`formulas.${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const piecewise = new Map<string, CompiledPiecewise>();
  for (const [id, segs] of Object.entries(raw.piecewise)) {
    try {
      const compiled = segs.map((s, i) => {
        const when = compileExpr(s.when);
        const then = compileExpr(s.then);
        assertIdentsKnown(when, known, `piecewise.${id}[${i}].when`);
        assertIdentsKnown(then, known, `piecewise.${id}[${i}].then`);
        return { when, then };
      });
      piecewise.set(id, { segments: compiled });
    } catch (e) {
      errors.push(`piecewise.${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    mechanics: {
      coeffs: raw.coeffs,
      flatCoeffs,
      formulas,
      piecewise,
      entityIndex: raw.entityIndex,
      raw,
    },
  };
}

export function evalFormula(
  m: CompiledMechanics,
  id: FormulaId,
  vars: Record<string, number> = {},
): number {
  return evalFormulaWithCoeffs(m, m.coeffs, id, vars);
}

/** 用调用方 coeffs（可与编译时不同）+ 运行时变量求值命名公式。 */
export function evalFormulaWithCoeffs(
  m: CompiledMechanics,
  coeffs: Params,
  id: FormulaId,
  vars: Record<string, number> = {},
): number {
  const ast = m.formulas.get(id);
  if (!ast) throw new ExprError(`公式未编译：${id}`);
  const bindings = { ...flattenCoeffs(coeffs), ...vars };
  const result = evalAst(ast, bindings);
  if (!Number.isFinite(result)) throw new ExprError(`公式 ${id} 结果非有限数`);
  return result;
}

export function evalPiecewise(
  m: CompiledMechanics,
  id: PiecewiseId,
  vars: Record<string, number> = {},
): number {
  return evalPiecewiseWithCoeffs(m, m.coeffs, id, vars);
}

export function evalPiecewiseWithCoeffs(
  m: CompiledMechanics,
  coeffs: Params,
  id: PiecewiseId,
  vars: Record<string, number> = {},
): number {
  const table = m.piecewise.get(id);
  if (!table) throw new ExprError(`分段表未编译：${id}`);
  const bindings = { ...flattenCoeffs(coeffs), ...vars };
  for (const seg of table.segments) {
    if (evalAst(seg.when, bindings) !== 0) {
      const result = evalAst(seg.then, bindings);
      if (!Number.isFinite(result)) throw new ExprError(`分段 ${id} 结果非有限数`);
      return result;
    }
  }
  throw new ExprError(`分段表 ${id} 无匹配分支`);
}

/** 已知实体索引路径（校验用）。 */
export const KNOWN_ENTITY_INDEX_PATHS = new Set([
  "npcs[].battleRewards",
  "npcs[].minExp",
  "npcs[].drops",
  "npcs[].goods",
  "npcs[].teaches",
  "grind_jobs[].hourlyGain",
  "grind_jobs[].roundGain",
  "grind_jobs[].jingPerHour",
  "moves[].damage",
  "moves[].force",
  "performs[].effect.amount",
  "performs[].cost",
  "items[].stats",
  "quests[].rewards",
  "skills[].maxLevel",
]);
