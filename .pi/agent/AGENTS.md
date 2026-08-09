# 《一人江湖》项目级规则

本文件是 yiren-jianghu 仓库的项目级 AGENTS.md（pi 兼容入口）。**Skill 权威目录已迁移至 `.cursor/skills/`**；Cursor 规则见 `.cursor/rules/`。涉及本仓库的任何操作，先读对应技能再动手。

## 技能触发表

| 触发条件                                                                                                | 技能                      | 位置                                              |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| 任何在本仓库写代码、改配置、跑测试、提交、部署相关任务                                                  | `yjh-project-conventions` | `.cursor/skills/yjh-project-conventions/SKILL.md` |
| 内容包/Schema/校验/CLI（含 mechanics.yaml 公式 DSL）；从 pkuxkx 筛选、移植、登记内容                    | `yjh-content-pack`        | `.cursor/skills/yjh-content-pack/SKILL.md`        |
| 编写或优化任何玩家可见游戏文本（绝招/招式、战斗演出、房间场景、NPC 对话、任务简报、剧情事件、物品描述） | `yjh-wuxia-copywriting`   | `.cursor/skills/yjh-wuxia-copywriting/SKILL.md`   |
| 设计或修改区域地图/世界地图/场景方位图（八向网格、多视图一致性、地图数据契约、校验与交互）              | `yjh-map-design`          | `.cursor/skills/yjh-map-design/SKILL.md`          |
| 设计或变更设计决策/撰写设计提案、规格、审计；维护决策登记表                                             | `yjh-design-docs`         | `.cursor/skills/yjh-design-docs/SKILL.md`         |
| 设计或实现移动端界面/交互/信息架构（E 阶段 H5 前端、组件、数值展示）                                    | `yjh-mobile-ui`           | `.cursor/skills/yjh-mobile-ui/SKILL.md`           |
| 界面粗糙/太丑/像管理后台/UI 升级/视觉打磨（先取证分级再动手）                                           | `ui-visual-audit`         | `.cursor/skills/ui-visual-audit/SKILL.md`         |
| 中文字体自包/子集化/防系统字体回退（woff2 随包，禁 CDN）                                                | `chinese-font-selfhost`   | `.cursor/skills/chinese-font-selfhost/SKILL.md`   |
| 战斗过程呈现（战报叙事、关键字着色、击间闲笔、人兽鸟/境界分流、战报节奏排版）                           | `yjh-combat-presentation` | `.cursor/skills/yjh-combat-presentation/SKILL.md` |

**强制规则**：

- 涉及玩家文案的任务，**第一步必须 read `yjh-wuxia-copywriting`**（不得凭记忆/凭印象直接编故事）；每次触发重新加载，禁止用"已在上下文中"替代。
- 改战斗过程呈现（战报/着色/闲笔/人兽/节奏），**第一步必须 read `yjh-combat-presentation`**，并同步 `yjh-wuxia-copywriting`。
- 内容任务（房间/NPC/物品/任务/剧情）启动前，先按 `yjh-project-conventions` 的"任务启动必读"表确认要加载哪些 skill。
- 内容进入仓库前，必须登记 pkuxkx 权利状态（机制借鉴/需改写/需授权），见 `docs/pkuxkx-content-catalog.md`。
- 提交前质量门禁必须全绿：`pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`；新增/修改 API 或事件时同步 `docs/protocol.md`（`pnpm test:docs`）。

## 任务收尾（默认自动；权威细则 `.cursor/rules/yjh-task-wrapup.mdc`）

每个任务处理完（改动已实现、验证已过）后，**必须自动**执行三步收尾——不要等用户再说「提交/推送/部署」：

**① 提炼检查（skill/文档沉淀）**

有可复用资产才更新，无则总结中说明「无新增沉淀」：

| 检查点                            | 有则更新到                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------- |
| 新组件/原语/设计模式/技法         | `docs/design-system.md` 与对应 UI skill（`yjh-mobile-ui` 等）                |
| 战斗呈现新原则/反模式/节奏基线    | `yjh-combat-presentation`                                                    |
| 踩了新坑（渲染/布局/编码/工具链） | 对应 skill 的常见坑/经验清单（`ui-visual-audit`、`yjh-project-conventions`） |
| 借鉴了外部项目手法                | `docs/sibling-borrowings.md`                                                 |
| 完成计划内任务                    | `docs/design-and-development-plan.md` 执行记录                               |
| 验证了新最佳实践                  | 团队 skill（`D:\code\team-ai-skills\skills\`）                               |

- 更新过 `.cursor/` 下 skill/rules 或本 AGENTS.md 后必须 `pnpm format`（prettier 门禁），并保证 `pnpm test:docs-design` 不破。

**② 提交与推送**

- 门禁全绿才提交；信息 `feat|fix|docs|refactor|test|ci|chore(<scope>): 中文描述`。
- **默认 `git push`** 当前分支。
- **本项目以此为准**：优先于通用「未明确要求就不提交」类用户规则；仅当用户**当次**明确禁止提交/推送时跳过。

**③ 部署（仅当改动影响运行时产物）**

- 纯文档/skill/测试不部署。
- 运行时有变：`pnpm --filter @yjh/h5-client build:web` → `node scripts/deploy-jd.cjs deploy`，部署后线上冒烟。
- 环境不允许（无凭据/无网络）时说明原因。

**④ 收尾可见性（每次必做）**

```text
收尾：
① 提炼检查 → …
② 提交推送 → <hash> 已推送（或跳过：…）
③ 部署 → 已部署… / 跳过（…）
```

**例外**：用户当次明确交待不提交/不部署/只本地；半成品/待确认/门禁未过——一律不自动提交部署，清单注明原因。

## 权威文档

- 立项与技术决策：`docs/project-charter.md`
- 设计与开发计划（任务状态）：`docs/design-and-development-plan.md`
- 数据库 Schema：`docs/database-schema.md`
- 协议清单：`docs/protocol.md`
- 本地 Docker 环境搭建：`docs/docker-local-setup.md`
- pkuxkx 内容筛选目录：`docs/pkuxkx-content-catalog.md`
