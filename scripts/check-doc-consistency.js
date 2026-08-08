#!/usr/bin/env node
/**
 * 设计文档一致性检查（design-docs skill §4 落地；与 pnpm test:docs 协议契约并列）。
 * 规则：
 *  1) docs/ 下所有 .md 中的「DC-xxx」引用必须已登记在 docs/decisions.md；
 *  2) decisions.md「影响文档」列中带 docs/ 路径或 .md 后缀的引用必须存在。
 * 简写别名（charter/计划/plan/database-schema/protocol 等）映射到 docs 权威文件。
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const decisionsPath = path.join(docsDir, "decisions.md");

const ALIAS = {
  charter: "docs/project-charter.md",
  计划: "docs/design-and-development-plan.md",
  plan: "docs/design-and-development-plan.md",
  "database-schema": "docs/database-schema.md",
  protocol: "docs/protocol.md",
  "pkuxkx-content-catalog": "docs/pkuxkx-content-catalog.md",
  "docker-local-setup": "docs/docker-local-setup.md",
  "numeric-baseline": "docs/numeric-baseline.md",
  "sibling-borrowings": "docs/sibling-borrowings.md",
  "beta-launch-checklist": "docs/beta-launch-checklist.md",
  "performance-baseline": "docs/performance-baseline.md",
};

function walkMd(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walkMd(p, out);
    } else if (name.endsWith(".md")) {
      out.push(p);
    }
  }
  return out;
}

const decisions = fs.readFileSync(decisionsPath, "utf8");
const declared = new Set([...decisions.matchAll(/DC-\d{3}/g)].map((m) => m[0]));
const errors = [];
let refCount = 0;

for (const file of walkMd(docsDir)) {
  if (file === decisionsPath) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const ref of new Set([...text.matchAll(/DC-\d{3}/g)].map((m) => m[0]))) {
    refCount += 1;
    if (!declared.has(ref)) {
      errors.push(`${path.relative(root, file)}：引用未登记 ${ref}`);
    }
  }
}

// 「影响文档」列的路径/别名存在性（.md 引用统一落到 docs/ 下）
for (const ref of new Set([...decisions.matchAll(/([A-Za-z0-9_./-]+\.md)/g)].map((m) => m[1]))) {
  const target = ref.startsWith("docs/") ? ref : `docs/${ref}`;
  if (!fs.existsSync(path.join(root, target))) {
    errors.push(`decisions.md 影响文档：${ref} 不存在`);
  }
}
for (const alias of new Set(
  [
    ...decisions.matchAll(
      /(charter|计划|plan|database-schema|protocol|pkuxkx-content-catalog|docker-local-setup|numeric-baseline|sibling-borrowings|beta-launch-checklist|performance-baseline)/g,
    ),
  ].map((m) => m[1]),
)) {
  const target = ALIAS[alias];
  if (target && !fs.existsSync(path.join(root, target))) {
    errors.push(`decisions.md 影响文档：别名 ${alias} → ${target} 不存在`);
  }
}

if (errors.length > 0) {
  console.error("❌ 设计文档一致性检查失败：");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✅ 设计文档一致性通过（${declared.size} 个 DC 编号已登记，校验 ${refCount} 处引用）`);
