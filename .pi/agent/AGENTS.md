# 《一人江湖》项目级规则

本文件是 yiren-jianghu 仓库的项目级 AGENTS.md。涉及本仓库的任何操作，先读对应技能再动手。

## 技能触发表

| 触发条件                                                                                                | 技能                      | 位置                                          |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| 任何在本仓库写代码、改配置、跑测试、提交、部署相关任务                                                  | `yjh-project-conventions` | `.pi/skills/yjh-project-conventions/SKILL.md` |
| 内容包/Schema/校验/CLI；从 pkuxkx 筛选、移植、登记内容                                                  | `yjh-content-pack`        | `.pi/skills/yjh-content-pack/SKILL.md`        |
| 编写或优化任何玩家可见游戏文本（绝招/招式、战斗演出、房间场景、NPC 对话、任务简报、剧情事件、物品描述） | `yjh-wuxia-copywriting`   | `.pi/skills/yjh-wuxia-copywriting/SKILL.md`   |

**强制规则**：

- 写玩家可见文案前，必须加载 `yjh-wuxia-copywriting`，不得凭印象直接编故事。
- 内容进入仓库前，必须登记 pkuxkx 权利状态（机制借鉴/需改写/需授权），见 `docs/pkuxkx-content-catalog.md`。
- 提交前质量门禁必须全绿：`pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`；新增/修改 API 或事件时同步 `docs/protocol.md`（`pnpm test:docs`）。

## 权威文档

- 立项与技术决策：`docs/project-charter.md`
- 设计与开发计划（任务状态）：`docs/design-and-development-plan.md`
- 数据库 Schema：`docs/database-schema.md`
- 协议清单：`docs/protocol.md`
- pkuxkx 内容筛选目录：`docs/pkuxkx-content-catalog.md`
