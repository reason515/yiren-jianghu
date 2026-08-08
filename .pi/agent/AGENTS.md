# 《一人江湖》项目级规则

本文件是 yiren-jianghu 仓库的项目级 AGENTS.md。涉及本仓库的任何操作，先读对应技能再动手。

## 技能触发表

| 触发条件                                                                                                | 技能                      | 位置                                          |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| 任何在本仓库写代码、改配置、跑测试、提交、部署相关任务                                                  | `yjh-project-conventions` | `.pi/skills/yjh-project-conventions/SKILL.md` |
| 内容包/Schema/校验/CLI；从 pkuxkx 筛选、移植、登记内容                                                  | `yjh-content-pack`        | `.pi/skills/yjh-content-pack/SKILL.md`        |
| 编写或优化任何玩家可见游戏文本（绝招/招式、战斗演出、房间场景、NPC 对话、任务简报、剧情事件、物品描述） | `yjh-wuxia-copywriting`   | `.pi/skills/yjh-wuxia-copywriting/SKILL.md`   |
| 设计或修改区域地图/世界地图/场景方位图（八向网格、多视图一致性、地图数据契约、校验与交互）              | `yjh-map-design`          | `.pi/skills/yjh-map-design/SKILL.md`          |
| 设计或变更设计决策/撰写设计提案、规格、审计；维护决策登记表                                             | `yjh-design-docs`         | `.pi/skills/yjh-design-docs/SKILL.md`         |
| 设计或实现移动端界面/交互/信息架构（E 阶段 H5 前端、组件、数值展示）                                    | `yjh-mobile-ui`           | `.pi/skills/yjh-mobile-ui/SKILL.md`           |
| 界面粗糙/太丑/像管理后台/UI 升级/视觉打磨（先取证分级再动手）                                           | `ui-visual-audit`         | `.pi/skills/ui-visual-audit/SKILL.md`         |
| 中文字体自包/子集化/防系统字体回退（woff2 随包，禁 CDN）                                                | `chinese-font-selfhost`   | `.pi/skills/chinese-font-selfhost/SKILL.md`   |

**强制规则**：

- 涉及玩家文案的任务，**第一步必须 read `yjh-wuxia-copywriting`**（不得凭记忆/凭印象直接编故事）；每次触发重新加载，禁止用"已在上下文中"替代。
- 内容任务（房间/NPC/物品/任务/剧情）启动前，先按 `yjh-project-conventions` 的"任务启动必读"表确认要加载哪些 skill。
- 内容进入仓库前，必须登记 pkuxkx 权利状态（机制借鉴/需改写/需授权），见 `docs/pkuxkx-content-catalog.md`。
- 提交前质量门禁必须全绿：`pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`；新增/修改 API 或事件时同步 `docs/protocol.md`（`pnpm test:docs`）。

## 任务收尾（自动三步，除非用户明确交待不提交/不部署）

每个任务处理完（改动已实现、验证已过）后，默认自动执行三步收尾：

**① 提炼检查（skill/文档沉淀）**

快速过一遍变更清单，判断是否产生值得沉淀的可复用资产——有才更新，无则跳过（总结中说明"无新增沉淀"）：

| 检查点                            | 有则更新到                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------- |
| 新组件/原语/设计模式/技法         | `docs/design-system.md` 与对应 UI skill（`yjh-mobile-ui` 等）                |
| 踩了新坑（渲染/布局/编码/工具链） | 对应 skill 的常见坑/经验清单（`ui-visual-audit`、`yjh-project-conventions`） |
| 借鉴了外部项目手法                | `docs/sibling-borrowings.md`                                                 |
| 完成计划内任务                    | `docs/design-and-development-plan.md` 执行记录                               |
| 验证了新最佳实践                  | 团队 skill（`D:\code\team-ai-skills\skills\`）                               |

- 更新过 `.pi/` 下 skill 文档后必须 `pnpm format`（prettier 门禁），并保证 `pnpm test:docs-design` 不破。

**② 提交与推送**

- 门禁全绿（① 前先跑）才提交；提交信息遵循 `feat|fix|docs|refactor|test|ci|chore(<scope>): 中文描述`。
- 默认 `git push` 当前分支远端。

**③ 部署（仅当改动影响运行时产物）**

- **只影响文档/skill/测试的改动不部署**（无运行时产物变化，避免无谓重建与风险）。
- 改动运行时产物（客户端代码/样式、服务端代码、迁移、内容包等）：先 `pnpm --filter @yjh/h5-client build:web`，再 `node scripts/deploy-jd.cjs deploy`（详见 yjh-project-conventions），部署后线上验证（bundle hash / 关键样式与文案）。
- 环境不允许（无凭据/无网络/无 Docker）时说明原因，不擅自跳过验证。

**④ 收尾可见性（每次必做）**

收尾完成后，最终回复必须以**三步清单**形式显式呈现执行结果，让规则执行可核对：

```text
收尾：
① 提炼检查 → 更新了 X / Y（或：无新增沉淀，理由）
② 提交推送 → <commit hash> 已推送
③ 部署 → 已部署（线上 hash/验证项）或 跳过（纯文档，理由）
```

- 即使用户未追问，也要在回复末尾输出清单（约 3–5 行），禁止隐式完成收尾。

**例外与安全**：用户明确交待不提交/不部署/只本地验证时一律遵守（清单中注明）；半成品/待确认设计/未过门禁时不自动提交部署；不确定时先问用户，不擅自执行。

## 权威文档

- 立项与技术决策：`docs/project-charter.md`
- 设计与开发计划（任务状态）：`docs/design-and-development-plan.md`
- 数据库 Schema：`docs/database-schema.md`
- 协议清单：`docs/protocol.md`
- 本地 Docker 环境搭建：`docs/docker-local-setup.md`
- pkuxkx 内容筛选目录：`docs/pkuxkx-content-catalog.md`
