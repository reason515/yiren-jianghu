<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》设计与开发计划</strong></span><br/>
<span style="font-size: 18px;">范围回顾 · 里程碑 · 按序任务清单 · 执行记录</span>

</div>

---

# 1. 目标与范围

本计划为实现《一人江湖》首个可玩切片（H5 邀请制封测）而制定。依据已确认决策：

- **立项与技术决策**：`docs/project-charter.md`
- **pkuxkx 内容筛选目录**：`docs/pkuxkx-content-catalog.md`（内容导入唯一入口）

## 1.1 切片目标

新手引导 → 主城枢纽 → 玄门剑宗门派 → 门派任务/衙门悬赏两条可挂机日常线 → 原创主线（3–5 节点）→ 战术模板参与的战斗 → 一次异步 PVP 验证。

## 1.2 非目标（首版明确不做）

实时相遇、原始命令行、LPC/FluffOS 运行时、宝石/强化/套装、押镖/剿匪、19 特技全量、转世/宠物/易容、支付、微信小程序（先 H5）、TapTap。

# 2. 里程碑总览

| 里程碑 | 内容 | 退出标准 | 预估 |
|---|---|---|---|
| M0 工程基座 | ✅ 完成 | — | A1–A6 全部完成，本机全绿；Docker 运行验证待服务器/CI |
| M1 核心规则可测 | ✅ 完成 | — | B1/B2 契约 + C1–C10 规则引擎全部完成，137 用例全绿；确定性可复现 |
| M2 切片内容 | ✅ 完成 | — | D1–D8 全部完成：dev-pack@0.2.0（18 房间/14 NPC/5 物品/6 技能/4 绝招/4 任务/5 主线），新手村→主城→门派主循环成型 |
| M3 H5 垂直闭环 | 🔄 进行中（核心闭环已接入） | E 阶段客户端全量 + H5 SPA 生产上线（http://117.72.34.43/，登录→建角→场景）；**剩余**：E14.9 重连体验、E14.10 打磨、E14.11 新手引导、E14.12 验收发布 |
| M2.5 服务端业务 | ✅ 完成 | — | B2 缺口全部补齐：auth/character/scene/skills/quests/templates/afk/pvp/leaderboard/forum/session 十一域 + 收尾 6 stub（logout 吊销会话 / characters 改名 / inventory equip·unequip·use 装备与物品效果结算 / content 版本）——**协议清单 40 路由 100% 真实实现，0 stub**（迁移 0006–0008）；299 用例全绿 + 本地真库 e2e |
| M1 核心规则可测 | B+C 阶段：领域契约 + 战斗/挂机/PVP/模板引擎 | 全部规则单测绿，确定性可复现 | 3–4 周 |
| M2 切片内容 | D 阶段：数值表、新手村/主城/门派/NPC/物品/任务/主线 | 内容包校验通过，可导入游戏世界 | 2–3 周 |
| M3 H5 垂直闭环 | E+F 阶段：客户端 + 联调 + 端到端冒烟 | 冒烟脚本全绿，真机可玩 | 3–4 周 |
| M4 部署与封测 | G 阶段：部署、备份、监控、20–50 人封测 | 核心三指标有基线数据 | 1–2 周 |
| M5 微信适配 | H 阶段（后续） | 微信登录/分享/订阅消息可用 | 另行评估 |

**总预估：M0–M4 约 10–13 周。**

# 3. 任务清单（按推荐顺序逐条推进）

> 每条任务含：目标 / 子步骤 / 交付物 / 验收标准 / 依赖 / 估时。
> 状态：`⬜ 待办`、`🔄 进行中`、`✅ 完成`。状态维护见 §4 执行记录。

## 阶段 A：工程基座

### A1 初始化单仓（monorepo）

- **目标**：建立可扩展的 TypeScript 单仓骨架，后续所有包在此之上开发。
- **子步骤**
  1. 根目录 `package.json`（private、workspace scripts、engines）与 `pnpm-workspace.yaml`
  2. 包划分：`apps/h5-client`（Taro React，首版占位）、`services/api`、`services/worker`、`packages/content`（内容 Schema）、`packages/game-core`（纯规则）、`packages/shared`（类型与协议）
  3. 基础配置：`tsconfig.base.json`、各包 tsconfig、eslint（flat config）、prettier、`.editorconfig`
  4. `.gitignore`（node_modules/dist/.env/备份）、`pnpm` 锁文件
  5. 每个包放最小占位（package.json + src/index.ts + 一个 smoke 测试）
- **交付物**：仓库结构 + 根脚本（`pnpm build/test/lint/typecheck`）
- **验收标准**：`pnpm install && pnpm typecheck && pnpm test` 全绿；目录结构与约定在 README 可见
- **依赖**：无
- **估时**：0.5–1 人日

### A2 CI 与仓库规范

- **目标**：从第一天保证代码质量门禁与可回滚提交。
- **子步骤**
  1. GitHub Actions：lint / typecheck / test / build 四步门禁
  2. PR 模板与分支约定（`main` 受保护，feature 分支合入）
  3. 提交信息规范（`feat|fix|docs|refactor|test|chore`）
  4. `.nvmrc` 固定 node 版本
- **验收标准**：push 后 CI 全绿；坏代码无法合入 main
- **依赖**：A1
- **估时**：0.5 人日

### A3 本地 Docker 环境

- **目标**：一条命令起本地全栈（API + PG + Redis + Worker），与服务器行为一致。
- **子步骤**
  1. `docker-compose.yml`：postgres、redis、api、worker、反向代理（Caddy/Nginx 占位）
  2. `.env.example` 与 `.env` 约定；`make` 或 npm scripts 封装（`dev:up`/`dev:down`/`migrate`/`seed`）
  3. 健康检查与依赖顺序（pg/redis ready 后起服务）
  4. 数据卷与备份目录约定
- **验收标准**：全新机器按 README 可一键起服务；`curl /health` 返回 ok
- **依赖**：A1
- **估时**：1 人日

### A4 数据库迁移与 ORM 基线

- **目标**：数据库结构可版本化、可回滚、可复现迁移。
- **子步骤**
  1. 选定迁移方案（建议 node-pg-migrate，避免 ORM 隐式行为）
  2. 迁移目录、命令、`schema_migrations` 校验
  3. seed 脚本约定（开发数据与封测数据分离）
  4. 连接池、事务封装、重试与超时配置
- **验收标准**：`pnpm migrate && pnpm seed` 幂等可重复；迁移失败回滚有日志
- **依赖**：A3
- **估时**：0.5–1 人日

### A5 API 骨架

- **目标**：服务端基础框架：路由、日志、错误信封、鉴权占位、限流骨架。
- **子步骤**
  1. Fastify（或等价）应用工厂：`createApp()` 可注入依赖便于测试
  2. 结构化日志（requestId、accountId 关联）；统一错误信封（code/message/requestId）
  3. 健康检查 `/health`、就绪检查 `/ready`（依赖 pg/redis）
  4. 邀请码认证中间件骨架；全局频率限制骨架
  5. 上下文与审计事件钩子占位
- **验收标准**：单测覆盖错误信封、健康检查、鉴权拒绝路径
- **依赖**：A3、A4
- **估时**：1–1.5 人日

### A6 内容包管线

- **目标**：地图/NPC/技能/物品/任务/数值全部以 JSON/YAML 内容包驱动，可校验可预览。
- **子步骤**
  1. `packages/content`：zod Schema 定义（内容 Schema v0.1）
  2. 校验器：引用完整性（房间↔出口↔NPC↔掉落↔任务↔奖励）、唯一 id、数值范围
  3. CLI：`validate`（CI 中跑）/ `preview`（生成统计摘要）/ `pack`（打内容包版本）
  4. 与 pkuxkx 筛选目录对接：每项内容带来源/权利状态元数据
- **验收标准**：故意注入坏数据能被校验拒绝；内容包可打包成单一 JSON 供服务端加载
- **依赖**：A1
- **估时**：1.5–2 人日

## 阶段 B：领域契约

### B1 领域模型与数据库表设计

- **目标**：一次定义全量核心领域，避免后续返工。
- **子步骤**
  1. 账号与角色：`accounts`、`characters`（单角色约束、状态、安全点、冻结/放弃语义）
  2. 成长：`skills`、`character_skills`（exp/潜能/武功等级与 exp 门槛）
  3. 战斗：`combat_sessions`、`combat_events`（战报事件流）
  4. 战术模板：`tactic_templates`（版本化、快照）
  5. 挂机作业：`afk_jobs`（状态机、时长、收益、递减、战报）
  6. PVP：`pvp_seasons`、`pvp_matches`（快照、种子、战报、积分）
  7. 排行榜：`leaderboard_snapshots`（长期 + 赛季）
  8. 论坛：`forum_*`（板块/帖/评论/点赞/举报/审核）
  9. 审计：`audit_events`（关键操作可追溯）
  10. 物品/装备：`items`、`character_items`、`character_equipment`（槽位）
  11. 内容版本：`content_versions`（服务端加载的内容包版本记录）
- **交付物**：ER 图（文档）+ 迁移文件
- **验收标准**：每个表有唯一索引与约束说明；放弃角色/冻结/风控路径有明确状态迁移
- **依赖**：A4
- **估时**：2 人日

### B2 客户端-服务端协议

- **目标**：H5/小程序共用的传输与事件协议。
- **子步骤**
  1. HTTP API 清单（认证、角色、场景、物品、技能、任务、模板、挂机、PVP、论坛、排行榜）
  2. WS 事件清单（state.sync、combat.*、afk.*、pvp.*、chat/forum 通知）
  3. 协议版本化（v1 前缀 + 向后兼容策略）
  4. 重连与恢复协议：会话 token、恢复点、未读结算拉取
  5. `packages/shared` 类型与 zod 编解码（服务端与客户端共用）
- **验收标准**：类型单测覆盖序列化/反序列化；协议文档在 `docs/protocol.md`
- **依赖**：B1
- **估时**：1.5–2 人日

## 阶段 C：游戏核心规则（纯 TS，可单测）

> 原则：规则引擎零 IO（不碰 DB/Redis/网络），输入输出纯函数，全部确定性可复现（PVP 用固定种子）。

### C1 数值参数表与公式模块

- **目标**：所有数值集中在参数表，pkuxkx 公式仅作对照。
- **子步骤**
  1. `game-core/params`：参数表数据结构（经验曲线、潜能、武功上限、任务奖励、挂机收益、每日递减）
  2. pkuxkx 对照列归档（来源文件 + 公式 + 重设计理由）
  3. 参数表随内容包版本加载（服务端可热更）
- **验收标准**：改参数不碰代码；对照列可追溯
- **依赖**：A6
- **估时**：1 人日

### C2 Vitals 计算

- **目标**：动态气血/精神/内力/精力上限，含内功加成。
- **子步骤**
  1. 参照 pkuxkx `attribute.c` 的 `query_max_qi/jing/neili/jingli` 结构
  2. 移动端节奏重设计：年龄衰减简化或移除、等级加成、内功系数
  3. 受伤/恢复（eff_qi/eff_jing）与食物饮水
- **验收标准**：属性表驱动的单测矩阵（不同内功等级 → 期望上限）
- **依赖**：C1
- **估时**：1–1.5 人日

### C3 战斗引擎 v1

- **目标**：回合制/半回合制战斗：命中三态、分系伤害、减伤、绝招触发。
- **子步骤**
  1. 战斗状态机（进场/行动/结算/结束）
  2. 命中/躲闪/招架计算（参照 `damage.h` calc_damage 思路）
  3. 分系伤害与防御减伤、内功加持
  4. 行动指令（普通攻击、绝招、回气、使用物品、逃跑）
  5. 事件流输出（供战报与前端演出）
- **验收标准**：确定性单测（同种子同输入 → 同输出）；胜负可复现
- **依赖**：C1、C2
- **估时**：2–3 人日

### C4 绝招定义与执行

- **目标**：4–6 个代表性绝招（1 内功、1 兵器、1 轻功/招架类等），验证绝招数据契约。
- **子步骤**
  1. 绝招数据 Schema（id/技能/条件/消耗/冷却/效果/演出）
  2. 从 pkuxkx 抽取结构样本（武当系绝招组织），文本与效果重写
  3. 执行引擎：条件校验、消耗、冷却、效果结算、事件输出
  4. 与战术模板的「动作」原子对接
- **验收标准**：每个绝招有单测（条件满足/不满足、消耗、冷却）
- **依赖**：C3
- **估时**：1–1.5 人日

### C5 技能成长

- **目标**：exp + 潜能 + 武功的学习/练习/领悟挂机循环。
- **子步骤**
  1. 经验获得（战斗/任务/挂机）与潜能获得
  2. `learn`（师父教学）、`practice`（练习消耗）、`study`（读书/领悟）
  3. exp 门槛检查（武功等级³ vs 经验）——参照 pkuxkx，重设为参数表
  4. 有效潜能 = potential − learned_points（沿用已定修正）
- **验收标准**：成长路径单测（学习→等级→门槛→封顶）
- **依赖**：C1、C2
- **估时**：1.5 人日

### C6 战术模板引擎（服务端）

- **目标**：结构化「条件 → 动作 → 冷却 → 优先级」模板，供挂机与 PVP 共用。
- **子步骤**
  1. 模板 Schema（多槽位、可命名、版本化、快照语义）
  2. 条件集合（气血/精神/内力/状态/绝招冷却/敌方状态）
  3. 动作集合（绝招、回气、恢复、等待）
  4. 评估器：每 tick 按优先级选择动作；冷却与资源校验
  5. 模板校验器（禁止危险组合、动作不可达、死循环检测）
- **验收标准**：模板评估单测（多种战术对比输出差异）；非法模板被拒绝
- **依赖**：C3、C4
- **估时**：1.5–2 人日

### C7 挂机作业（AFK Job）

- **目标**：服务端持久化作业：离线继续、时长上限、每日递减、失败条件、战报。
- **子步骤**
  1. 作业状态机（启动/运行/暂停/完成/失败）与 DB 持久化
  2. Redis 延迟队列（tick 调度）与 Worker 消费；崩溃恢复（扫描 overdue 作业）
  3. 任务型挂机：接单→前往→击杀→交差（复用 quest 四相结构，服务端重写）
  4. 修炼型挂机：打坐/吐纳/练功/领悟
  5. 结算：收益按参数表、每日递减、时长上限、资源消耗
  6. 战报生成与「断线后查看未读结算」协议
- **验收标准**：Worker 重启后作业恢复；确定性结算单测；超时/失败路径有战报
- **依赖**：C5、C6、B1、B2
- **估时**：3–4 人日

### C8 PVP 引擎

- **目标**：单角色快照自动战斗、固定种子可重演、赛季积分。
- **子步骤**
  1. 快照生成（属性/武功/装备/绝招/模板版本）
  2. 模拟器：复用战斗引擎 + 双方模板，固定随机种子
  3. 战报（事件流 + 关键判定记录）
  4. 赛季（4–8 周）、积分 ELO 式、每日挑战次数限制
  5. 奖励（赛季积分兑换/排行奖励，不掠夺）
- **验收标准**：同一快照对战可完全重演；防重放（一次匹配只能结算一次）
- **依赖**：C3、C4、C6、B1
- **估时**：2–3 人日

### C9 经济与掉落

- **目标**：银两单一货币；掉落表概率 + min_exp 分级；商店买卖。
- **子步骤**
  1. 银两账本（余额、流水、来源/去向审计）
  2. 掉落表（概率、数量、条件、min_exp 分级）
  3. 商店（NPC 商品表、买入卖出价、现金流出上限防通胀）
- **验收标准**：掉落确定性单测；交易流水完整
- **依赖**：C3、B1
- **估时**：1.5 人日

### C10 地图与导航

- **目标**：房间图数据 + 路径查找 + 挂机白名单。
- **子步骤**
  1. 房间图模型（房间/出口/门/特殊动作）——结构参照 xkx 前端 roomMaps 思路
  2. 路径查找（BFS/加权）与不可达提示
  3. 挂机目标白名单（复用 xkx 白名单经验，新世界重做）
- **验收标准**：已知起点终点路径断言单测
- **依赖**：A6、B1
- **估时**：1 人日

## 阶段 D：切片内容

> 全部内容来自筛选目录登记条目；文本原创，仅结构/数值参照 pkuxkx。每项带来源与权利状态。

### D1 数值参数表内容

- 经验/潜能/武功/任务奖励/挂机收益/每日递减首版数值
- **验收**：与 C1 参数表联动，封测前可调
- **估时**：1 人日

### D2 新手村

- 结构参照 `d/newbie_lxsz/`：引导房间链、毕业流程（属性重设入口）
- 文本、NPC、任务全部原创
- **估时**：2 人日

### D3 主城

- 结构参照 `d/city/`：衙门/客栈/药铺/当铺/商店/门派入口/安全点
- **估时**：2–3 人日

### D4 玄门剑宗

- 门派区域、师徒链、武功门类（内功+剑+轻功+招架+知识）、门派任务地形
- 武功清单收敛到必需十几门；绝招 4–6 个
- **估时**：2–3 人日

### D5 NPC 内容

- 战斗对象（属性/武功/掉落/重生/主动攻击）与功能性 NPC（商贩/师父/任务发放）
- **估时**：1–1.5 人日

### D6 物品与装备

- 武器/护具/药品/食物；穿脱、负重、槽位
- **估时**：1 人日

### D7 任务与主线

- 门派任务（taskd 结构重写）、衙门悬赏（四相结构）、主线 3–5 节点
- **估时**：2–3 人日

### D8 内容校验与导入

- 全量校验通过；权利登记回填；内容包版本 v0.1 打版
- **估时**：1 人日

## 阶段 E：H5 客户端

> 复用 xkx 前端设计语言（墨色武侠 token、卡片交互、九宫格出口、Sheet 体系），但不复用其 MUD 命令与 LPC 解析。

### E1 Taro H5 工程与设计基线

- Taro + React + TS；设计 token（CSS 变量：墨色/宣纸/玉色/朱砂）；组件基线（Sheet/Chip/Bar/Toast）
- **估时**：2 人日

### E2 登录与角色

- 邀请码登录（服务端 accountId）；创建角色（属性分配）；放弃角色（二次确认 + 30 天冻结提示）
- **估时**：1.5 人日

### E3 场景与探索

- 文字叙事场景卡、出口（九宫格）、场景动作、NPC/物品交互
- **估时**：2–3 人日

### E4 手动战斗 UI

- 动作按钮（普攻/绝招/回气/物品/逃跑）、战报演出、胜负结算
- **估时**：2 人日

### E5 角色面板

- 属性/武功/装备/行囊；有效潜能展示
- **估时**：1.5 人日

### E6 战术模板编辑器

- 模板列表/新建/编辑（条件→动作→冷却→优先级）；挂机与 PVP 分别绑定
- **估时**：1.5–2 人日

### E7 挂机 UI

- 启动（选模板/时长）、状态条、停止、战报、未读结算
- **估时**：1.5 人日

### E8 任务与主线面板

- 当前任务、主线进度、可前往目标
- **估时**：1 人日

### E9 地图

- 房间图展示、当前位置、可前往出口；挂机导航指示
- **估时**：1.5 人日

### E10 论坛

- 板块/公告/发帖/评论/点赞/举报；审核状态展示
- **估时**：2 人日

### E11 排行榜

- 长期成长榜 + 赛季竞技榜
- **估时**：1 人日

### E12 重连与状态恢复

- 断线重连、状态同步、恢复点、未读结算拉取
- **估时**：1.5 人日

### E13 视觉与演出

- 轻量插画占位、战斗演出动画、环境音占位
- **估时**：2 人日（可延后）

### E14 H5 应用组装与面板闭环（M3 收尾，🔄 进行中）

> **前置**：F0 PVE 战斗域（服务端）——战斗 UI 无可接 API 前无法验收；任务 kill 相位也依赖战斗。

- **✅ E14.1 场景交互完善**（依赖 F0）：NPC 对话/交易/请托（**交易面板借鉴 xkx ShopView**，见 docs/sibling-borrowings.md）、物品拾取、EntitySheet 接线（动作从世界中长出）；场景刷新与移动反馈。场景物品按角色一次性拾取，商贩报价/买卖由内容包定义并服务端事务结算（DC-025）。
  - 验收：村口广场 NPC 可对话、商店可交易、拾取入行囊（已通过服务、H5 DOM 与真库 E2E）
- **✅ E14.2 角色面板与学武**：CharacterSheet 数据加载（vitals/武功/装备/行囊）+ 装备卸装/使用（inventory 三接口）+ learn/practice/study 动作与数值反馈（**面板结构借鉴 xkx TrainSheet/buildPracticeOptions**）
  - 验收：面板与 API 数据一致；学武耗精/升级即时反馈（已通过角色快照聚合、DOM 与服务单测）
- **✅ E14.3 任务面板**：QuestPanel 接/交/查 + 主线足迹 + 可前往（goto 相位）导航；移动抵达与 F0 战斗结束分别推进 goto / kill 相位。
  - 验收：接 q_newbie_trail → 战斗杀野狗 → 交差发奖闭环（已通过真库 E2E）
- **✅ E14.4 挂机闭环**：GrindBanner（运行状态）+ AfkSheet（修炼武功/行侠差事+战术/时长/启停）+ AfkReportView（叙事战报 + 未读回响）；行侠挂机按已接悬赏逐次结算（DC-026）。
  - **修炼挂机**：服务端快照驱动状态横幅；选择武功、时长后只提交 `study` 意图；手动停止立即展示服务端战报；resume 收到未读战报后补拉全文并打开回响。
  - **行侠挂机**：`/afk/start` 仅接受已接且正处击杀相位的任务；Worker 以固定种子、已固化战术快照自动结算一场目标战斗，并在同一事务内推进任务、结算战利与自动交差（DC-026）。真库 E2E 已覆盖。
  - 验收：启动→横幅→停止→战报叙事回响；重连后未读战报；行侠差事/战术选择只提交受控意图（已通过服务、H5 DOM 与真库 E2E）
- **✅ E14.5 战斗 UI**（依赖 F0）：CombatView 接入 PVE（双方状态 Bar + 动作按钮 + 战报演出 + 结果收束）；场景 NPC「较量」与断线 status 恢复均已接线。TacticEditor 的任务挂机绑定待 E14.4 行侠结算完成后开放；**战斗中悬浮动作条交互借鉴 xkx FloatingPerfBar**。
  - 验收：手动战斗可打野狗/盗匪（已通过服务、H5 DOM 与真库 E2E）；模板影响自动行为待任务挂机
- **✅ E14.6 PVP 对战 UI**：对手列表/赛季信息/发起对战（二次确认）/战报回放（**依赖 F0：复用统一后的快照构造与战斗 UI 模式**）。PvpView 展示赛季余日与可邀战对手，发起前 ConfirmSheet 二次确认；匹配成功后拉取 `GET /pvp/matches/:id` 用叙事事件流回放（与 PVE 共用 `battleEventLine` 渲染器，避免文案漂移）。
  - 验收：与第二账号对战完整闭环（服务端真库 E2E 已覆盖；前端 DOM 单测覆盖邀战→确认→回放）
  - 验收：与第二账号对战完整闭环
- **✅ E14.7 论坛完整交互**：ForumView 板块/帖子/详情 + PostComposer 发帖 + 评论/点赞/举报。App 接线：板块列表 → 帖子列表（顶部发帖）→ 详情（回帖/点赞/举报）；点赞后用服务端返回值更新本地 likedByMe/计数；举报复用 PostComposer 提交理由；纯文本社区由服务端把关。
  - 验收：发帖→他人可见→评论/点赞计数（服务端真库 E2E 已覆盖；前端 DOM 单测覆盖入口与回调）
  - 验收：发帖→他人可见→评论/点赞计数
- **✅ E14.8 地图与榜单**：MapSheet（区域地图八向导航）+ LeaderboardView（成长/赛季双榜）。服务端新增 `GET /map`（三件套：apiManifest/protocol/契约测试）返回内容包 rooms.grid + exits 去重无向边与当前所在标记；榜单为公开读，`isMe` 由客户端按自己的角色 id 标记。
  - 验收：地图可达区域可导航（相邻出口真实移动，跨房间提示循出口前行）；榜单数据正确、我的行高亮（服务、真库 E2E 与 DOM 测试覆盖）
  - 验收：地图可达区域可导航；榜单数据正确
- **E14.9 断线重连体验**：ReconnectingOverlay + resume 恢复点 + 状态同步
  - 验收：断线重连回到场景且未读战报提示
- **E14.10 体验打磨（美观度+易用性）**：tokens.css 视觉一致性复核（**对照 xkx stat-exp/potential token 补漏**）、页面过渡/按钮反馈动效、sound.ts 音效、空态/加载态/错误态、toast 反馈（**xkx 浮层内 toast 约定**）、44px 触控复核、375/390/430 断点与底部安全区；**ChoiceRow 分段控件泛型化（禁 select）**
  - 验收：mobile-ui 体验承诺——30 秒内知道"我在哪、有何变化、下一步"
- **E14.11 新手引导**：首启引导（登录→建角→第一条任务→学武→首次战斗），文案遵循 yjh-wuxia-copywriting；**方法参考 sanguo first-session-ux-v3（首日闭环/首战教学展示），GuideTip 轻量提示组件**
  - 验收：新玩家 30 秒内完成一次可理解行动
- **E14.12 验收与发布**：各面板 DOM 单测补全 + 浏览器/真机全闭环（登录→建角→探索→学武→任务→战斗→挂机→PVP→论坛）+ 生产部署更新（重新 build:web + 上传）；**新待办：移植 sanguo check-doc-consistency（design-docs §4 落地）**
  - 验收：试玩清单全绿（复用 beta-launch-checklist 门禁）
- **依赖**：E1–E13、M2.5 API、F0 战斗域
- **估时**：5–7 人日（E14.1–14.9 各 0.5 日，14.10–14.12 各 0.5–1 日）

## 阶段 M2.5：服务端业务（API 真实实现，F 联调前置）

> 发现的计划缺口：B2 只建了协议清单与 501 stub，E 阶段全是客户端；F 的端到端冒烟需要真实 handler。按域逐个实现（`services/api/src/`），已实现路由因 hasRoute 自动顶替 stub。每域：代码 + 单测（mock db）+ `docs/protocol.md` 无需变更（路由已在清单）。

- M2.5-auth ✅：`POST /auth/login`（邀请码 → 账号幂等绑定 + sessions 会话 token）、verifyToken 查 sessions（过期/未知拒绝）；迁移 0006（accounts.invite_code + sessions 表）；DB 依赖注入（deps.db）
- M2.5-account/character：GET /account、GET/POST /characters、PUT /characters/name、POST /characters/discard（单角色约束 + 30 天冻结）
- M2.5-scene/inventory：GET /scene（内容包房间 + NPC/物品组装）、POST /scene/action、inventory 四接口
- M2.5-skills/quests：skills 四接口（learn/practice/study 调 game-core growth，新增 POST /skills/study 并同步清单/协议）、quests 三接口（接/交/查）；迁移 0007（character_quests + practice_points）；recordProgress 进度钩子供战斗/挂机域调用
- M2.5-templates/afk：templates CRUD（tactic 校验）+ afk start/stop/status/reports（对接 C7 状态机 + Redis/Worker）
- M2.5-pvp/leaderboard：pvp 四接口（快照/种子/ELO）+ 榜单两接口（快照）
- M2.5-forum：forum 六接口（受控纯文本 + 审核状态）
- M2.5-session：GET /session/resume（重连恢复点 + 未读结算）

### F0 PVE 战斗域（服务端，试玩可玩前置，✅ 完成）

- 战斗是武侠核心玩法；H5 CombatView 组件已就绪但无可接 API（M2.5 未做战斗域，POST /scene/action 非 move 501）。手动 PVE 采用服务端逐回合持久化与可重演事件流（DC-023）。
- **路由**（补 apiManifest + protocol.md 三件套）：POST /combat/start（对 NPC 开战：角色快照 + NPC 快照 + seed，建 combat_sessions + 首个回合事件）、POST /combat/action（回合动作 attack/recover/perform/flee——服务端权威，客户端只发意图，runBattle 逐步推进）、GET /combat/status（当前战斗）；结果：掉落（economy rollDrops）+ 经验/潜能 + **任务 kill 相位推进（调 questsService.recordProgress）**
- **统一 PVP 快照构造**：把 pvpService.buildSnapshot 的门类等级占位公式替换为战斗域共享的 combatant 构造（F1 待办落地，战斗公式只留一处实现）
- 事件流：combat_events（seq 有序回放）；战报复用 combat_sessions.result
- **依赖**：C3 runBattle（已完成）、M2.5 各域、content NPC 定义
- **估时**：2–3 人日

## 阶段 F：联调与测试

### F1 规则单元测试

- 战斗/绝招/模板/挂机/PVP 确定性；参数表边界
- **待办**：PVE 战斗域（`/combat` 相关路由）落地时，**统一 PVP 快照构造**——替换 `pvpService.buildSnapshot` 的门类等级占位公式（见 M2.5-pvp 执行记录），战斗公式只有一处实现
- **估时**：持续

### F2 集成测试

- API + DB + Redis 集成；Worker 崩溃恢复；并发幂等
- **✅ 已完成（worker 结算）**：`services/worker` 已实现修炼挂机（`settlement.ts` 逐次参悟；`run.ts` 以 last_tick_at 结算、事务 + `FOR UPDATE` 并发幂等；`index.ts` 启动即跑一轮）。行侠挂机以固定种子 + 固化战术快照自动结算一场已接击杀任务，在同一事务内写资源、掉落、任务推进、自动交差与终态战报（DC-026）；真库 E2E 已覆盖（journey 12 + smoke 5）。
- **估时**：2 人日

### F3 端到端冒烟

- 登录→创建→探索→战斗→挂机→断线→恢复→PVP→论坛 全链路自动化
- **✅ 已完成**（本地真库）：`services/api/e2e/journey.e2e.test.ts` 11 步全链路（登录→建角→恢复点→场景→学武→任务→挂机→PVP→断线恢复→装备→论坛→登出）+ smoke 5；**e2e 抓出 2 个 mock 测不到的真 bug**：① 复合主键静默缺失（node-pg-migrate createTable 第三参 `{primaryKey}` 被忽略）→ 迁移 0009 条件补约束 + 修正 0002/0004/0005 源码；② jsonb 二次解析（pg 已解析对象）→ afk/pvp 读侧双保险
- **估时**：2–3 人日

### F4 性能与容量基线

- 单机 200 并发 API 压测；挂机 Worker 每 tick 成本；PG/Redis 容量预估
- **✅ 已完成**：`docs/performance-baseline.md`——/health 4,354 RPS / /ready 2,556 / /scene 1,839（p95 < 130ms）；worker 6.1ms/作业；限流器 120/分钟实测生效；50 人封测 3 个月 PG < 2GB、Redis < 50MB，单机足矣；pvp 战报事件流为主要增长项（G2 归档待办）；新增 `AppOptions.disableRateLimit`（压测专用）
- **估时**：1 人日

## 阶段 G：部署与封测

### G1 服务器 Docker 部署（隔离）

- 独立 compose 栈、子域名、与现 MUD 完全隔离；镜像版本化
- **✅ 已完成（117.72.34.43 京东云 Ubuntu 22.04 / 2 核 2GB / 40GB）**：
  - Docker 29.7.2（阿里云 docker-ce 源 + daocloud 镜像加速）+ compose v5
  - 生产 compose 全栈：postgres/redis healthy、api/worker running；迁移 0001–0009 落生产库
  - 镜像：服务器本地 docker build（git archive 源码包 → build；2GB 内存 OK，复用 buildkit 缓存）
  - **G1 冒烟抓出 2 个生产入口 bug**：① API `index.ts` bootstrap 从未接 db/content（生产全 stub）→ 修复注入 db+内容包+readiness+优雅停机；② Worker 入口只导出函数（容器 Restarting 循环）→ 新增 `main.ts` 入口（加载内容+循环+信号停机）
  - 生产冒烟 10 步全通（登录→建角→场景→移动→武功→挂机→论坛→榜单→resume）；worker 服务器结算正常
  - Nginx 公网入口：`http://117.72.34.43/health` 通（server_name _，80→127.0.0.1:3000，WS 升级头预留）
  - 生产 .env：随机 DB 密码 + 邀请码（yjh2026 等 5 个），容器内 host 用 compose 服务名；chmod 600
- **待办**：正式域名+HTTPS（备案后配证书）；~~H5 客户端静态托管~~（已上线：/var/www/yiren + nginx SPA）；**H5 浏览器端到端手动验证收尾**（真实打字走登录→建角→场景→挂机→论坛；自动化注入受 React 受控输入与限流干扰）
- **估时**：1–1.5 人日

### G2 备份/监控/日志

- 每日备份 + 恢复演练；结构化日志收集；健康检查 + 基础监控告警
- **✅ 已完成（117.72.34.43）**：backup.sh（每日 03:00 pg_dump gzip + 保留 14 份，**恢复演练**至临时库 23 表完整）；healthcheck.sh（每 5 分钟公网/容器/磁盘探针，失败写日志+退出码，告警通道 TODO）；archive.sh（每周日归档 30 天前 pvp 战报 report，pvpService null 防护）；compose json-file 日志轮转（10MB×3）
- **估时**：1.5 人日

### G3 邀请码与风控

- 邀请码发放/校验/限额；频率限制；账号风控钩子
- **✅ 已完成**：**Redis 分布式限流**（固定窗口 `rl:{ip}:{minute}` + EXPIRE 60s，多实例一致；无 redis 回退内存桶；`RATE_LIMIT_PER_MIN` env，默认 120；压测 `disableRateLimit` 保留）+ **frozen 账号风控钩子**（accounts.status=frozen 拒绝登录 account_frozen，401）；bootstrap 注入 redis（**又抓 1 个生产入口 bug：deps 整体赋值覆盖 redis**——已修 spread 合并）；邀请码限额语义=幂等单账号（现状）；生产验证 Redis key 落库；306 用例 + 16 e2e 全绿
- **估时**：1 人日

### G4 封测执行与周复盘

- 20–50 人；周复盘（数据 + 反馈）；调参闭环
- **✅ 启动准备完成**：`docs/beta-launch-checklist.md`——上线门禁 15 项全核验（回归 10/10、限流/风控/备份/监控/归档/公网/资源余量）；35 个邀请码注入生产；运营节奏（反馈通道/周复盘/调参闭环/应急预案）成文；封测执行与周复盘为**持续**任务
- **估时**：持续

### G5 指标看板

- 新手闭环完成率、次日留存、挂机断线恢复成功率；漏斗与告警
- **估时**：1–1.5 人日

## 阶段 H：微信小程序适配（后续）

### H1 微信登录绑定（accountId ↔ openid）
### H2 生命周期/订阅消息/分享适配
### H3 分包、包体与审核合规

## 阶段 I：商业化与扩展（后续）

### I1 TapTap 小游戏适配
### I2 支付与商品/权益数据模型
### I3 内容扩展（按筛选目录「延期」项逐个评审）

# 4. 执行记录

> 每条任务推进时在此勾选；完成一条即提交一条（含测试与文档）。

| 任务 | 状态 | 完成提交 | 备注 |
|---|---|---|---|
| A1 初始化单仓 | ✅ 完成 | — | 骨架 + 基础配置，build/typecheck/test/lint/format 全绿 |
| A2 CI 与仓库规范 | ✅ 完成 | — | GitHub Actions 门禁 + PR 模板 |
| A3 本地 Docker 环境 | ✅ 完成 | — | compose + .env.example + 脚本；本机 Docker Desktop + WSL2 就绪，dev:infra/migrate（0001–0006）/e2e 本地真库全绿（见 docs/docker-local-setup.md） |
| A4 数据库迁移 | ✅ 完成 | — | node-pg-migrate 基线 + CI migrations 作业（up/down） |
| A5 API 骨架 | ✅ 完成 | — | Fastify 应用工厂：健康/就绪/错误信封/requestId/限流骨架/鉴权占位，13 用例 |
| A6 内容包管线 | ✅ 完成 | — | zod Schema + 引用校验 + CLI（validate/preview/bundle）+ fixtures，18 用例 |
| B1 领域模型 | ✅ 完成 | — | 5 个领域迁移（账号/角色/技能/物品/模板、战斗/AFK、PVP/榜单、论坛/审计/内容版本）+ docs/database-schema.md；CI up/down 验证 |
| B2 协议 | ✅ 完成 | — | docs/protocol.md 全量清单（44 路由 + 10 事件 + 重连协议）；@yjh/shared 类型与 zod codec；API 按清单注册 501 stub（契约测试强制一致） |
| 工程机制：E2E 冒烟 + CD 脚手架 + 协议一致性 | ✅ 完成 | — | CI e2e 作业（真实 PG+Redis）；deploy 工作流 + Dockerfile + 生产 compose 脚手架（激活需 secrets）；docs/protocol.md ↔ 代码契约测试（test:docs） |
| C1–C10 规则引擎 | ⬜ | | 按清单顺序推进 |
| C1 数值参数表 | ✅ 完成 | — | game-core/params：经验/潜能/挂机递减/装载校验（复用 content Schema 单一来源），确定性单测 |
| C2 Vitals 计算 | ✅ 完成 | — | game-core/vitals：动态上限（qi/jing/neili/jingli）+ eff 钳制 + 食物饮水；参数表 vitals 段（内容包驱动），属性矩阵单测 |
| C3 战斗引擎 v1 | ✅ 完成 | — | game-core/combat：seeded RNG（mulberry32）+ 命中三态 + 分系伤害/减伤 + 回合循环 + 动作选择器接口 + 事件流；参数表 combat 段扩展，确定性单测（55 用例） |
| C4 绝招定义与执行 | ✅ 完成 | — | 4 个代表性绝招内容（内功回气/兵器伤害/技能门槛/处决）+ 条件/消耗/冷却校验 + 映射战斗动作 + 冷却跟踪；buff 类型保留 Schema 但校验器告警；71 用例 |
| C5 技能成长 | ✅ 完成 | — | game-core/growth：learn（潜能+精，exp 门槛 = 等级³/10）/practice（气血累积）/study（精累积）；有效潜能修正；84 用例 |
| C6 战术模板引擎 | ✅ 完成 | — | game-core/tactic：有序规则（条件→动作，顺序即优先级）+ 兜底；条件枚举 + 动作（attack/recover/flee/perform）；评估器接入 C3/C4（冷却/消耗校验）；语义校验器（未知引用/遮蔽/buff 警告）；95 用例 |
| C7 挂机作业 | ✅ 完成 | — | game-core/afk：生命周期状态机（运行/暂停/完成/失败/取消）+ 时长上限 + 每日递减结算 + 战报 + 任务四相转换表；Redis/Worker/导航在服务层接线；108 用例 |
| C8 PVP 引擎 | ✅ 完成 | — | game-core/pvp：快照对战（复用 C3/C6，固定种子可重演）+ ELO 积分 + 每日挑战限制 + 赛季窗口 + 防重放匹配 id；参数表 pvp 段；118 用例 |
| C9 经济与掉落 | ✅ 完成 | — | game-core/economy：银两账本（流水+余额审计，不为负）+ 掉落表（概率+min_exp 分级+数量区间，seeded 确定性）+ 商店（买入扣款/卖出防通胀现金流上限）；126 用例 |
| C10 地图与导航 | ✅ 完成 | — | game-core/map：房间图（出口边+门阻挡）+ BFS 路径 + 白名单约束（吸收 xkx 教训）；137 用例 |
| D1–D8 切片内容 | ⬜ | | |
| D1 数值参数表 | ✅ 完成 | — | docs/numeric-baseline.md：pkuxkx 对照列归档（成长/状态/战斗/挂机/PVP/经济）+ 首版生效值 + 调整纪律；params.json 为生效列 |
| D2 新手村 | ✅ 完成 | — | 引导房间链 6 间（醒来→村口→武馆→杂货铺→客栈→村外小径，含 grid 坐标）+ 功能 NPC（村长/王师傅/掌柜）+ 野狗练手怪 + 干粮 + 引导任务与剧情链 3 节点；Schema 增 room.grid / npc.goods + 校验；27 文件全绿 |
| D3 主城 | ✅ 完成 | — | 城门/主街/衙门/客栈（安全点）/药铺/当铺/山门入口/城郊官道 8 间（grid 八向自洽 + 城门边界=区域总览）+ 沈捕头悬赏线 + 金创药 + 入城剧情；新手村→主城接通；43 文件全绿 |
| D4 玄门剑宗 | ✅ 完成 | — | 演武场/祖师堂/藏经阁/后山练功崖 4 间 + 师徒链（玄真道长/大师兄/长老）+ 武功补齐（身法/剑屏/道学，6 技能）+ 门派差事 + 入门剧情 + 野狼；56 文件全绿 |
| D5 NPC 内容 | ✅ 完成 | — | 覆盖于 D2–D4：14 个 NPC（战斗对象 4 + 功能性 10），掉落/对话/商品齐备 |
| D6 物品与装备 | ✅ 完成 | — | 武器/护具/药品/食物四类齐备（铁剑/粗布衣/布鞋/金创药/干粮）；槽位由 kind 决定、负重用 weight（无 Schema 变更） |
| D7 任务与主线 | ✅ 完成 | — | 4 任务（新手悬赏/衙门悬赏/门派差事）+ 主线 5 节点（初入江湖→拜师→出村→入城→入门） |
| D8 内容校验与导入 | ✅ 完成 | — | 打版 dev-pack@0.2.0（58 文件，error=0）；权利登记与目录一致（结构参照 newbie_lxsz/city/wudang，文本原创） |
| E1–E13 客户端 | ⬜ | | |
| M2.5-auth 登录/会话 | ✅ 完成 | — | POST /auth/login（邀请码幂等绑定 + sessions token）、verifyToken 查会话表、deps.db 注入、迁移 0006；209 用例 |
| M2.5-account/character | ✅ 完成 | — | POST/GET /characters（单角色约束 + 名号唯一 + 属性 80 池校验 + 初始房间）、GET /account、POST /characters/discard（active→discarded 冻结）；215 用例 |
| M2.5-scene/inventory | ✅ 完成 | — | GET /scene（内容包组装房间/NPC/物品/动作）、POST /scene/action（move 分支，其余 501）、GET /inventory（def 回填 + 装备标记）；deps.content 注入；221 用例 |
| M2.5-skills/quests | ✅ 完成 | — | skillsService（learn 扣潜能/精 + exp 门槛；practice/study 逐次演练可批量，进度点持久化）；questsService（接/交/查 + recordProgress 钩子，可重复任务重接重置）；迁移 0007（character_quests + character_skills.practice_points）；新增 POST /skills/study 同步清单/协议；@yjh/game-core 依赖接入；本地真库迁移 + e2e 全绿；248 用例 |
| M2.5-templates/afk | ✅ 完成 | — | templatesService（CRUD + tactic zod Schema + validateTacticTemplate 语义校验 + 论剑默认唯一 + 上限 12）；afkService（start/stop/status/reports：kind/时长/武功/模板归属校验、快照固化、cancelled 战报 + wuxia 叙事、无作业正常态）；无需新迁移（表在 0002/0003）；267 用例；本地真库 e2e 全绿 |
| M2.5-pvp/leaderboard | ✅ 完成 | — | pvpService：赛季自举（无活跃季时幂等创建）、对手列表、startMatch（快照构造：C2 真公式上限 + 门类等级占位公式、默认论剑模板回退、每日 5 次、赛季窗口、固定 seed 模拟 + ELO 结算落库 + 战报事件流）、getMatch（仅参与者）；leaderboard 实时榜（growth/season_pvp，快照表留给 worker 生成）；10 用例；277 全绿 + 本地真库 e2e |
| M2.5-forum | ✅ 完成 | — | forumService：板块自举（3 默认坊）+ 帖/评论/点赞/举报（受控纯文本：长度 + 拒 <>/、仅可见目标可互动、举报队列 open 状态）；公开读（含计数子查询）/鉴权写；9 用例；286 全绿 + 本地真库 e2e |
| M2.5-session | ✅ 完成 | — | GET /session/resume：stateVersion（协议版本）+ 角色快照（vitals/位置/有效潜能）+ 未读挂机/PVP 战报（迁移 0008：afk_jobs/pvp_matches.read_at，返回即置已读）；无角色正常态 character:null；5 用例；291 全绿 + 本地真库迁移/e2e |
| M2.5 收尾 6 stub | ✅ 完成 | — | POST /auth/logout（吊销会话）；PUT /characters/name（唯一/长度/归属）；POST /inventory/equip·unequip·use（按 kind 落槽 + 同槽替换、物品效果 heal/feed 上限钳制、数量递减/用完删除）；GET /content/version（当前包）；8 用例；**清单 40 路由 0 stub**；299 全绿 + 真库 e2e |
| E1 H5 设计基线 | ✅ 完成 | — | tokens.css（墨色武侠 token 体系）+ 基础组件 Sheet/Chip/Bar/Toast（44px 触控/aria/语义标签）+ happy-dom DOM 单测；Taro 脚手架随 E2 登录页接入 |
| E2 登录与角色 | ✅ 完成 | — | LoginPage（邀请码）+ CharacterCreateSheet（名号/性别分段/四维分配 80 池）+ ConfirmSheet（放弃二次确认）+ authApi（可注入 fetch，错误信封映射）；文案按 wuxia 规范；156 用例；Taro 运行时接入为 E2.1 待办 |
| E3 场景与探索 | ✅ 完成 | — | SceneView（叙事优先+见闻 Tab）+ ExitPad 九宫格（map-design 场景方位图，八向+上下进出竖列）+ EntitySheet（能力→动作：交易/拜师/请托/较量/拾取）+ sceneTypes 数据模型；160 用例 |
| E4 手动战斗 UI | ✅ 完成 | — | CombatView（双方状态 Bar + 战报演出 + 动作按钮：普攻/绝招/回气/逃跑 + 结果收束横幅）；服务端权威：客户端只发动作意图；164 用例 |
| E5 角色面板 | ✅ 完成 | — | CharacterSheet（经验/可用潜能/银两语义标签 + 四维当前·先天 + 武功门类色/精通 Lv/进度/已装备 + 装备槽 + 行囊分类色 + 放弃入口）；168 用例 |
| E6 战术模板编辑器 | ✅ 完成 | — | TacticEditor（多模板列表 + 规则优先级排序 + 条件 chips/数值 + 动作 chips/绝招选择 + 兜底动作 + 论剑默认 + 遮蔽警告）；结构化禁脚本禁原生 select；173 用例 |
| E7 挂机 UI | ✅ 完成 | — | GrindBanner（运行状态/停止原因+知道了）+ AfkSheet（任务挂机/模板/时长选择/启动停止）+ AfkReportView（叙事回响+收益摘要+失败原因）；178 用例 |
| E8 任务与主线面板 | ✅ 完成 | — | QuestPanel（江湖足迹节点链 + 手头之事任务卡：简报/相位进度/奖励/可前往·接受·交差）；182 用例 |
| E9 地图 | ✅ 完成 | — | MapSheet（SVG 八向区域舆图：语义网格/边裁切/当前玉色高亮/北标/区域标签/动态 viewBox/缩放·拖拽·回到位置/锁定节点禁导航）；185 用例 |
| E10 论坛 | ✅ 完成 | — | ForumView（板块→帖子→详情：评论/点赞/举报）+ PostComposer（纯文本发帖，标题/正文长度限制）；190 用例 |
| E11 排行榜 | ✅ 完成 | — | LeaderboardView（成长榜/论剑榜双轨 seg + 赛季信息 + 排名/名/语义标签 + 我的行高亮）；193 用例 |
| E12 重连与状态恢复 | ✅ 完成 | — | 重连状态机（指数退避/最大次数/failed）+ ReconnectingOverlay（断线提示/倒计时/立即重连）+ resumeClient（GET /session/resume 对齐 shared 协议，错误信封映射）；199 用例 |
| E13 视觉与演出 | ✅ 完成 | — | ArtPlaceholder（首字印章占位）+ sound 环境音占位（可注入/事件映射表）+ effects（绝招行高亮动画，动效克制）；204 用例 |
| F1–F4 联调测试 | ✅ 完成 | — | F1 规则确定性（持续）+ F2 Worker 结算（settlement.ts 纯函数 + run.ts FOR UPDATE 幂等 + startWorker 崩溃恢复）+ F3 全链路 e2e（journey 11 步，抓出复合主键/jsonb 二次解析 2 真 bug）+ F4 性能基线（4354/2556/1839 RPS，worker 6.1ms/作业，docs/performance-baseline.md） |
| F0 PVE 战斗域 | ✅ 完成 | — | DC-023/024；逐回合可重演 state（RNG 调用计数 + 绝招冷却 + 有序事件）、迁移 0010 单场约束、PVE/PVP 共用角色战斗体。`/combat/start`、`/combat/action`、`/combat/status` 已接入 attack/recover/flee/perform；绝招按内容包校验，胜利按 NPC `battleRewards` / `drops` 结算并调用 `recordProgress` 推进 kill 任务。服务/规则/内容测试与真库 journey E2E（16 用例）均通过；E14.3/14.5/14.6/14.11 前置已解除。 |
| E14 H5 面板闭环 | 🔄 进行中 | — | **E14.1 场景交互已接入**：交谈/请托/交易/拾取均从 EntitySheet 的结构化动作进入；ShopView 用服务端交易快照展示报价、银两与行囊，场景物品每角色仅可拾取一次（DC-025），真库 E2E 覆盖。**E14.2 角色面板与学武已接入**：`GET /characters/me` 提供角色四维、行止与有效潜能；客户端合并角色/武功/行囊快照，装备槽由已佩挂物品派生；请教/演练/参悟、佩上/卸下/使用均只提交服务端意图，结果刷新人物簿并反馈。**E14.3 任务面板已接入**：`GET /quests` 返回服务端组装的 `{ quests, story }`；QuestPanel 完成接/交/查、主线足迹、目标名与 goto 指向，移动抵达由服务端推进 goto 相位，战斗结束刷新 kill 进度；交差奖励即时回显。**E14.4 挂机闭环已接入**：`/afk/status`、`/afk/start`、`/afk/stop`、`/afk/reports` 与 resume 未读报告接入 GrindBanner/AfkSheet/AfkReportView；AfkSheet 以分段控件切换修炼/行侠，修炼选已学武功+时长，行侠选已接击杀差事+战术模板+时长，只提交受控意图（DC-026）。行侠作业由 Worker 固定种子自动结算，真库 E2E 覆盖。**E14.5 战斗 UI 已接入**：场景 NPC「较量」→ `/combat/start`，服务端状态/事件适配为 CombatView；受控 action（普攻/回气/逃跑/绝招）→ `/combat/action`，胜负横幅、收益摘要、断线 status 恢复均已接线。**E14.6 PVP 论剑已接入**：PvpView（赛季余日 + 对手列表）+ 发起对战二次确认 + PvpReplayView（匹配后拉取 `GET /pvp/matches/:id` 叙事回放，与 PVE 共用事件渲染器）。**E14.7 论坛完整交互已接入**：ForumView 板块→帖子→详情 + PostComposer 发帖/回帖/举报；点赞后用服务端返回值更新本地 likedByMe/计数。**E14.8 地图与榜单已接入**：服务端新增 `GET /map`（rooms.grid + 去重边 + current 标记）；MapSheet 相邻出口真实移动、跨房间提示；LeaderboardView 双榜接线，榜单公开读故客户端按角色 id 标记我的行。其余 4 子任务待办；借鉴 xkx ShopView/TrainSheet/FloatingPerfBar/ChoiceRow + sanguo first-session-ux（见 docs/sibling-borrowings.md）；估时 5–7 人日 |
| G1–G4 部署封测 | ✅ 完成 | — | G1 部署上线（117.72.34.43，生产入口接线修复 ×2）；G2 备份/监控/日志（恢复演练 23 表）；G3 Redis 限流 + frozen 风控（deps 覆盖修复）；G4 封测门禁（15 项核验 + 35 邀请码，docs/beta-launch-checklist.md） |
| G5 指标看板 | ⬜ | | 封测期周复盘数据聚合（SQL 脚本）；试玩阶段后可排 |

# 5. 风险与开放问题

| 风险 | 影响 | 缓解 |
|---|---|---|
| 数值曲线未实测 | 平衡性差、留存低 | 参数表集中 + 封测周复盘调参 |
| 挂机 Worker 稳定性 | 结算丢失/重复 | 幂等作业、恢复扫描、确定性单测 |
| 微信生态限制（后续） | 发布延期 | H5 先验证，接口预留绑定 |
| pkuxkx 内容授权 | 法律风险 | 筛选目录权利登记 + 文本原创 |
| 单角色 + 防刷号 | 排行榜公平性 | 30 天冻结、风控、邀请制 |

**开放问题**：美术插画来源（外包/占位/AI 辅助）、服务器迁移时间点、封测招募渠道——均不影响 A–F 阶段推进。

# 6. 下一步（当前任务）

继续 **E14 H5 面板闭环**：E14.1–E14.8（场景/角色/任务/挂机/战斗/PVP/论坛/地图·榜单）均已接入并验收。**下一步推进 E14.9 断线重连体验**（ReconnectingOverlay + resume 恢复点 + 未读战报提示的完整接线与体验打磨），随后 E14.10 体验打磨、E14.11 新手引导、E14.12 验收发布。
