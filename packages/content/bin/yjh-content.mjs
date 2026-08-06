#!/usr/bin/env node
/**
 * 内容包 CLI（A6）：
 *   yjh-content validate <dir>    校验内容包（结构 + 引用完整性）
 *   yjh-content preview <dir>     统计摘要
 *   yjh-content pack <dir> [out]  打版为单一 JSON
 */
import { loadContentDir } from "../dist/load.js";
import { validateContentPack, hasErrors } from "../dist/validate.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(here);
const [command, dirArg, outArg] = process.argv.slice(2);
const dir = dirArg
  ? dirArg.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(dirArg)
    ? dirArg
    : join(packageRoot, dirArg)
  : join(packageRoot, "fixtures/pack");

if (!command || !["validate", "preview", "pack"].includes(command)) {
  console.error("用法: yjh-content <validate|preview|pack> <dir> [out]");
  process.exit(2);
}

try {
  const { pack, fileCount } = await loadContentDir(dir);
  const issues = validateContentPack(pack);

  switch (command) {
    case "validate": {
      if (issues.length === 0) {
        console.log(
          `✅ ${pack.manifest.name}@${pack.manifest.version} 校验通过（${fileCount} 个文件）`,
        );
      } else {
        for (const issue of issues) {
          console.log(
            `${issue.severity === "error" ? "❌" : "⚠️"} [${issue.code}] ${issue.message}`,
          );
        }
      }
      process.exit(hasErrors(issues) ? 1 : 0);
    }
    case "preview": {
      console.log(`内容包：${pack.manifest.name}@${pack.manifest.version}`);
      console.log(`  描述：${pack.manifest.description || "-"}`);
      console.log(`  文件数：${fileCount}`);
      console.log(`  房间：${pack.rooms.length}`);
      console.log(`  NPC：${pack.npcs.length}`);
      console.log(`  物品：${pack.items.length}`);
      console.log(`  技能：${pack.skills.length}`);
      console.log(`  绝招：${pack.performs.length}`);
      console.log(`  任务：${pack.quests.length}`);
      console.log(`  主线节点：${pack.story.length}`);
      console.log(
        `  校验问题：${issues.length}（error=${issues.filter((i) => i.severity === "error").length}）`,
      );
      process.exit(0);
    }
    case "pack": {
      const out = outArg ?? `${dir}.pack.json`;
      const { writeFile } = await import("node:fs/promises");
      if (hasErrors(issues)) {
        console.error("存在 error 级问题，拒绝打版：");
        for (const issue of issues.filter((i) => i.severity === "error")) {
          console.error(`  [${issue.code}] ${issue.message}`);
        }
        process.exit(1);
      }
      await writeFile(out, JSON.stringify(pack, null, 2), "utf8");
      console.log(`✅ 已打版：${out}`);
      process.exit(0);
    }
  }
} catch (err) {
  console.error("内容包处理失败：", err instanceof Error ? err.message : err);
  process.exit(1);
}
