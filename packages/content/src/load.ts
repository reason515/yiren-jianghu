import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { load as loadYaml } from "js-yaml";
import { contentPackSchema, type ContentPack, type Params } from "./schema.js";
import { compileMechanics, type CompiledMechanics, type MechanicsConfig } from "./mechanics.js";

/**
 * 内容包加载器（A6 / DC-046）。
 * 目录约定：
 *   <dir>/manifest.json
 *   <dir>/mechanics.yaml   … 机制总表（系数+公式）；兼容旧 params.json
 *   <dir>/rooms/*.json(.yaml)   … 其余子目录同构
 *   <dir>/maps/world.json       … 可选天下图（单文件）
 * 支持 .json 与 .yaml/.yml 文件。
 */

const COLLECTIONS = [
  "rooms",
  "npcs",
  "items",
  "skills",
  "moves",
  "performs",
  "quests",
  "story",
  "grind_jobs",
] as const;

async function readJson(file: string): Promise<unknown> {
  const raw = await readFile(file, "utf8");
  const text = raw.trim();
  if (!text) return undefined;
  const ext = extname(file).toLowerCase();
  return ext === ".yaml" || ext === ".yml" ? loadYaml(text) : JSON.parse(text);
}

async function loadCollection(dir: string, name: string): Promise<unknown[]> {
  const collectionDir = join(dir, name);
  const entries = await readdir(collectionDir, { withFileTypes: true }).catch(() => []);
  const out: unknown[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (![".json", ".yaml", ".yml"].includes(ext)) continue;
    const data = await readJson(join(collectionDir, entry.name));
    if (Array.isArray(data)) out.push(...data);
    else if (data) out.push(data);
  }
  return out;
}

export type LoadedContentPack = ContentPack & {
  mechanics: MechanicsConfig;
  compiled: CompiledMechanics;
};

export interface LoadResult {
  pack: LoadedContentPack;
  /** 已解析的文件数（含 manifest/mechanics）。 */
  fileCount: number;
}

async function loadMechanicsRaw(dir: string): Promise<unknown> {
  const yamlPath = join(dir, "mechanics.yaml");
  const ymlPath = join(dir, "mechanics.yml");
  const jsonPath = join(dir, "mechanics.json");
  for (const p of [yamlPath, ymlPath, jsonPath]) {
    try {
      return await readJson(p);
    } catch {
      /* try next */
    }
  }
  // 过渡：仅 coeffs 的旧 params.json → 无公式，compile 会失败并给出明确错误
  try {
    const params = await readJson(join(dir, "params.json"));
    return { coeffs: params, formulas: {}, piecewise: {} };
  } catch {
    throw new Error(`内容包缺少 mechanics.yaml（或兼容的 params.json）：${dir}`);
  }
}

export async function loadContentDir(dir: string): Promise<LoadResult> {
  const manifest = (await readJson(join(dir, "manifest.json"))) as unknown;
  const mechanicsRaw = await loadMechanicsRaw(dir);
  const compiledResult = compileMechanics(mechanicsRaw);
  if (!compiledResult.ok) {
    throw new Error(`mechanics 编译失败：\n${compiledResult.errors.join("\n")}`);
  }
  const compiled = compiledResult.mechanics;
  const params: Params = compiled.coeffs;

  const loaded: Record<string, unknown[]> = {};
  for (const name of COLLECTIONS) {
    loaded[name] = await loadCollection(dir, name);
  }

  const worldMap = await readJson(join(dir, "maps", "world.json")).catch(() => undefined);

  const base = contentPackSchema.parse({
    manifest,
    params,
    rooms: loaded.rooms,
    npcs: loaded.npcs,
    items: loaded.items,
    skills: loaded.skills,
    moves: loaded.moves,
    performs: loaded.performs,
    quests: loaded.quests,
    story: loaded.story,
    grindJobs: loaded.grind_jobs,
    ...(worldMap ? { worldMap } : {}),
  });

  const pack: LoadedContentPack = {
    ...base,
    mechanics: compiled.raw,
    compiled,
  };

  const fileCount =
    2 +
    COLLECTIONS.reduce((acc, name) => acc + (loaded[name]?.length ?? 0), 0) +
    (worldMap ? 1 : 0);

  return { pack, fileCount };
}
