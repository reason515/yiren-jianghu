import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { compileMechanics, type CompiledMechanics } from "./mechanics.js";

/**
 * 与 fixtures/pack/mechanics.yaml 同源的默认编译机制（单测 / DEFAULT_PARAMS 求值用）。
 * 生产路径应使用 loadContentDir 得到的 pack.compiled。
 */

let cached: CompiledMechanics | undefined;

export function defaultCompiledMechanics(): CompiledMechanics {
  if (cached) return cached;
  const file = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/pack/mechanics.yaml");
  const raw = loadYaml(readFileSync(file, "utf8"));
  const result = compileMechanics(raw);
  if (!result.ok) {
    throw new Error(`默认 mechanics.yaml 编译失败：\n${result.errors.join("\n")}`);
  }
  cached = result.mechanics;
  return cached;
}
