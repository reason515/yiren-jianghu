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

## 权威文档

- 立项与技术决策：`docs/project-charter.md`
- 设计与开发计划（任务状态）：`docs/design-and-development-plan.md`
- 数据库 Schema：`docs/database-schema.md`
- 协议清单：`docs/protocol.md`
- 本地 Docker 环境搭建：`docs/docker-local-setup.md`
- pkuxkx 内容筛选目录：`docs/pkuxkx-content-catalog.md`
