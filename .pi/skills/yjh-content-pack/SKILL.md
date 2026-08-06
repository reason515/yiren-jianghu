---
name: yjh-content-pack
description: 《一人江湖》(yiren-jianghu) 内容包与 pkuxkx 内容筛选规范——内容包目录结构、Schema 与校验规则、CLI 用法、新增/修改内容的完整流程，以及从 pkuxkx 提取内容的筛选与权利登记流程。触发条件：新增或修改地图/房间、NPC、物品、技能、绝招、任务、主线、数值参数表；改动 packages/content 的 schema/validator/CLI；运行 content:validate/preview/pack；从 pkuxkx 复刻、筛选、移植任何内容；用户提到"内容包"“筛选目录”“权利登记”“加个地图/门派/任务/数值”。涉及通用开发约定先读 yjh-project-conventions。
---

# 《一人江湖》内容包与 pkuxkx 筛选规范

## 定位

游戏内容全部以**版本控制的结构化内容包**承载（JSON/YAML），服务端按版本加载。内容不进代码；Schema 在 `packages/content/src/schema.ts`（zod），校验在 `validate.ts`。

## 内容包目录结构

```text
<dir>/
├── manifest.json        # { version: "x.y.z", name, description }
├── params.json          # 数值参数表（经验曲线/潜能/战斗基础/状态 Vitals/挂机/经济）
├── rooms/*.json         # 房间：id/area/name/exits/doors/actions/npcIds/itemIds
├── npcs/*.json          # NPC：battle|vendor|apprentice_master|quest_giver|npc
├── items/*.json         # 物品：weapon|armor|drug|food|misc
├── skills/*.json        # 技能：force|weapon|dodge|parry|knowledge
├── performs/*.json      # 绝招：skillId/条件/消耗/冷却/效果（一等公民，战术模板动作原子）
├── quests/*.json        # 任务：sect|bounty|main；phase: goto|kill|talk|deliver|collect
└── story/*.json         # 主线节点：questId/next/conditions
```

支持 `.json` 与 `.yaml/.yml`。**id 命名**：小写字母/数字/`_`/`-`。

## Schema 要点（改 schema 前先读 schema.ts）

- `id` 正则：`/^[a-z0-9][a-z0-9_-]*$/`。
- 房间出口 `exits[].roomId`、`npcIds`、`itemIds` 都是**引用**，必须指向同包内已存在实体；`grid`（可选 `[col, row]`）为地图语义网格坐标（八向布局，见 yjh-map-design）。
- NPC 掉落 `drops[]`：`chance ∈ [0,1]`、`min ≤ max`、可选 `minExp`（掉落按玩家经验分级）；`goods`（商店库存：itemId + buy/sell，kind=vendor 时生效）。
- 绝招 `performs[]` 必须引用存在的 `skillId`；条件为受控枚举（self_qi_below_pct / self_neili_above_pct / skill_level_at_least / enemy_qi_below_pct），**不开放脚本/正则**；冷却字段为 `cooldownTurns`（回合制语义）；`effect.type="buff"` Schema 保留但 v1 引擎未实现（校验器发 warning）。
- 任务 `quests[]`：phase 的 targetId 按类型校验（goto→房间、kill/talk→NPC、deliver/collect→物品）；奖励 items 引用物品；可选 `briefing` 字段为任务简报（玩家文案，见 yjh-wuxia-copywriting）。
- 数值参数 `params.json`：`afk.maxDurationHours ∈ [0.5, 24]`（校验器建议 1–12）、`dailyDiminishRate ∈ [0,1]`。

## CLI（packages/content）

```bash
pnpm content:validate                    # 校验默认 fixtures/pack；有 error 级 issue 时 exit 1
pnpm content:preview                     # 统计摘要
pnpm content:pack                        # 打版单一 JSON（<dir>.pack.json，已 gitignore）
node packages/content/bin/yjh-content.mjs <cmd> <dir>   # 显式目录（相对 packages/content 解析）
```

校验失败时按 `[code] 描述` 逐条输出；error 级问题会阻止打版。新增内容后必须跑一次 validate。

## 新增/修改内容的标准流程

1. 若来自 pkuxkx：先走下方筛选登记流程，取得"纳入"决定。
2. 按 Schema 编写内容文件（文本**原创**，只复用结构与数值参考）；**玩家可见文案（房间描写/NPC 对话/任务简报/绝招描述）必须遵循 `yjh-wuxia-copywriting` skill**。
3. 修改 `packages/content/src/validate.test.ts` 或新增用例覆盖新规则/新字段。
4. `pnpm build && pnpm test && pnpm content:validate` 全绿。
5. 打版 `pnpm content:pack`，更新 `docs/design-and-development-plan.md` 对应任务状态。

## pkuxkx 内容筛选与权利登记（强制）

从 pkuxkx（`D:/code/xkx/pkuxkx-utf8`）提取任何内容前：

1. **先查 `docs/pkuxkx-content-catalog.md`**——它是内容进入本仓库的**唯一入口**。已登记条目按决定状态执行；未登记的候选先评估：玩法价值 / 依赖 / 移动端适配度 / 权利状态。
2. 权利登记三类（目录 §2）：
   - **可借鉴机制**：重新设计为新游戏的结构化规则，标注来源文件；
   - **需改写的设定与文本**：保留灵感，名称/文本全部原创并独立验收；
   - **需确认授权的代码或素材**：未确认前**不得复制进仓库**。
3. 在目录中登记：条目 / 来源文件 / 提取内容 / 依赖 / 移动端适配度 / 玩法价值 / 权利状态 / 决定（纳入/延期/否决/待议）。
4. 决定"纳入"后按标准流程实现；"延期"条目需触发条件满足并经评审才能改"纳入"。

## 已定内容决策速查（勿突破）

- 首版战斗契约：动态上限（qi/jing/neili/jingli）+ 命中/躲闪/招架三态 + 分系伤害/减伤；pkuxkx 公式仅作参考契约。
- 成长：技能制（exp + 潜能 + 武功，无硬等级），单潜能货币，仅银两。
- 门派原型：玄门剑宗（pkuxkx 武当为结构样本，文本原创）；技能收敛到必需十几门，绝招 4–6 个验证。
- 装备：基础装备 + 消耗品；无宝石/强化/套装（筛选目录中为"延期"）。
- 日常：门派任务为核心 + 新手衙门悬赏过渡；押镖/剿匪延期。
- 数值：重设计 + 集中参数表，pkuxkx 作对照列，移动端会话节奏（单次探索 10–30 分钟）。
- 明确否决：实时相遇、原始命令行、LPC/FluffOS、离线交易、QQ/BBS/IM、反机器人。

## 常见坑

1. 改了 schema 但忘了跑 build，validate.test 与 CLI（引 dist）会拿到旧类型/旧校验。
2. CLI 显式路径按 packages/content 相对解析；绝对路径（`/` 开头或盘符）直接使用。
3. 校验器只做结构与引用完整性，**不做**平衡性检查；数值合理性靠 `params.json` 集中调参。
4. fixtures 有两套：`pack/`（有效）与 `broken-pack/`（故意坏引用，验证拒绝）。CI 的 content:validate 用默认 fixtures，别把 broken-pack 设为默认。
5. **新增参数段（如 vitals/growth/pvp）必须 5 处同步**，漏一处 CI/单测必红：① `packages/content/src/schema.ts` 的 `paramsSchema` ② `fixtures/pack/params.json` ③ `fixtures/broken-pack/params.json` ④ `packages/game-core/src/params.ts` 的 `DEFAULT_PARAMS` ⑤ `packages/content/src/validate.test.ts` 的 basePack（C2/C5/C8 均按此扩展）。
6. **战术模板/挂机作业/PVP 快照是玩家运行时数据，不是内容包**——它们属于 `game-core/tactic.ts`、`afk.ts`、`pvp.ts`；内容包只管 房间/NPC/物品/技能/绝招/任务/主线/数值参数。别把玩家数据塞进内容包。
7. **地图布局数据（grid 坐标/出口方向/via 绕行/世界图 geo）按 `yjh-map-design` 规范设计**，D/E 阶段随内容包落地（rooms 加 grid 或新增 maps 集合），校验并入 validator；逻辑导航（连通性）在 `game-core/map.ts`（C10），两者共享出口真相。
8. **玩家可见文案必须遵循 `yjh-wuxia-copywriting`**（绝招描述/房间/NPC 对话/任务 briefing），已登记为内容制作标准流程的一部分。
9. **内容包 JSON 文本内嵌英文引号 `"` 会破坏 JSON 解析**（D2 踩过：房间/NPC 对话里的引号）。中文对话一律用「」引号（JSON 合法且更符合文风）；写完跑 `pnpm content:validate` 会第一时间抓到。
