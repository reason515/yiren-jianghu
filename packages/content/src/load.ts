import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { load as loadYaml } from "js-yaml";
import { contentPackSchema, type ContentPack } from "./schema.js";

/**
 * 内容包加载器（A6）。
 * 目录约定：
 *   <dir>/manifest.json
 *   <dir>/params.json
 *   <dir>/rooms/*.json(.yaml)   … 其余子目录同构
 *   <dir>/maps/world.json       … 可选天下图（单文件）
 * 支持 .json 与 .yaml/.yml 文件。
 */

const COLLECTIONS = ["rooms", "npcs", "items", "skills", "performs", "quests", "story"] as const;

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

export interface LoadResult {
  pack: ContentPack;
  /** 已解析的文件数（含 manifest/params）。 */
  fileCount: number;
}

export async function loadContentDir(dir: string): Promise<LoadResult> {
  const manifest = (await readJson(join(dir, "manifest.json"))) as unknown;
  const params = (await readJson(join(dir, "params.json"))) as unknown;

  const loaded: Record<string, unknown[]> = {};
  for (const name of COLLECTIONS) {
    loaded[name] = await loadCollection(dir, name);
  }

  // 天下图为单文件（maps/world.json），非集合实体列表。
  const worldMap = await readJson(join(dir, "maps", "world.json")).catch(() => undefined);

  const pack = contentPackSchema.parse({
    manifest,
    params,
    rooms: loaded.rooms,
    npcs: loaded.npcs,
    items: loaded.items,
    skills: loaded.skills,
    performs: loaded.performs,
    quests: loaded.quests,
    story: loaded.story,
    ...(worldMap ? { worldMap } : {}),
  });

  const fileCount =
    2 +
    COLLECTIONS.reduce((acc, name) => acc + (loaded[name]?.length ?? 0), 0) +
    (worldMap ? 1 : 0);

  return { pack, fileCount };
}
