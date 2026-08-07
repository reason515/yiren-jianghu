---
name: yjh-mobile-ui
description: 《一人江湖》(yiren-jianghu) 移动端 UI/UX 设计规范——体验承诺、信息架构、核心交互原则与组件语言。触发条件：设计或实现前端界面（E 阶段 H5 客户端）、场景页/战斗/修行/人物/市集/门派等界面、交互流程、信息层级、组件（Sheet/chip/状态条/地图）、数值展示；用户提到"前端设计""界面""交互""信息架构""UI/UX"或要求按本项目设计规范美化界面。视觉 token 在 E 阶段落地 tokens.css；方法论移植自 D:\code\sanguo-mud\docs\design\mobile-uiux-v1.md，并按本项目决策（无原始指令、文字叙事、战术模板、挂机战报）改写。地图相关见 yjh-map-design；文案见 yjh-wuxia-copywriting。
---

# 《一人江湖》移动端 UI/UX 设计规范

## 定位

《一人江湖》是"文字叙事为主"的移动端武侠 RPG，**不是带古风皮肤的管理面板**。UI 的目标：玩家每次打开手机，像展开一卷行旅簿——先读见闻，再看局势，最后在拇指可及之处作出决定。

**体验承诺（E 阶段验收基准）：**

> 在 30 秒内，玩家能知道"我在哪里、此刻有什么变化、下一步有什么分量"，并完成一次可理解的行动或离线安排。

## 1. 核心主张（继承并转译自 sanguo-mud mobile-uiux-v1）

| 主张                                   | 在本项目的转译                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **阅读是主界面，不是日志附件**         | 场景叙事占探索页最高优先级；数字只在状态、比较和决策需要时出现                                                    |
| **动作从世界中长出**                   | 人物/物品/出口/任务各自产生对应动作 chip，不把一切塞进万能功能页                                                  |
| **战斗以"看局势—改预设—抓时机"为核心** | 平时按战术模板自动运行；关键抉择（手动绝招/回气）提供高价值按钮；对应"手动探索纯手动、挂机按模板"的已定决策       |
| **离线必须留下叙事回声**               | 挂机归来看到的不只是"收益 +338"，而是角色在何处做了什么、发生了什么（战报叙事化，文案遵循 yjh-wuxia-copywriting） |
| **数值必须带语义标签**                 | 双数标明"当前/先天"或"当前/上限"；不裸露 `18 / 16`；禁止把 hp/score 等命令名露给玩家                              |
| **操作目标 ≥44px**                     | 移动端所有可点区域 44px 以上热区                                                                                  |
| **高风险操作二次确认**                 | 关键战、放弃角色、不可逆消耗、PVP 发起等必须确认                                                                  |

## 2. 信息架构（主场景 + 导航层级）

探索（场景）为常驻主界面；详情用浮层/Sheet，不离开主场景。导航层级：

```text
顶栏：生存状态（气/精/内力等紧凑状态条）+ 货币
  ↓
主内容：当前场景唯一的核心问题
  ↓
底部动作条：当前情境下最值得做的 2–3 件事
  ↓
底部导航：探索 / 战局 / 修行 / 人物 / 市集 / 门派（按 E 阶段定稿）
```

- 顶栏状态条固定传达生存信息；其余资源在人物簿展开，降低阅读噪声。
- 场景页组织：**场景叙事（80–150 字）→ 此地人物/物品 Tab → 此刻可往（局部方位图）→ 场景动作**；不先展示任务清单。
- 地图（区域/世界）是二级 Sheet，不抢占场景首屏；交互与数据按 `yjh-map-design`。

## 3. 组件语言

- **场景卡**：细线分栏（像简牍），不用厚重圆角卡片；边线为信息分组服务。
- **操作**：矩形、轻边框、短动词；玉色="可做"，朱砂="高风险"。
- **选择控件**：互斥选择用分段按钮/可见 Tab，**禁止原生 `<select>`**；人物/物品列表用 chip。
- **状态条**：固定气/精/内力；变低时**色彩与文案共同警示**，不单靠颜色。
- **品质**：凡品/良品/珍品/名器用品质色 + **文字标签并存**（不能只靠颜色）。
- **动效**：页面切换短距离淡入；绝招施展只加一条高亮文本，不做影响阅读的粒子特效。

## 4. 视觉方向

- E 阶段定义 `tokens.css`：参考 xkx 的墨色武侠 token（`--ink`/`--paper`/`--jade`/`--cinnabar`）与 sanguo 行旅簿的层级（深漆墨底、宣纸字、铜金次级强调、玉色可行动、朱砂危险），最终以本项目定稿。
- 字体：正文 `Noto Serif SC`；标题/主按钮 `ZCOOL XiaoWei`（与 xkx 一致）；禁止 Inter/Roboto/Arial 作主字体。
- 禁止散落写死色值；新颜色先补 token。

## 4.1 已落地组件基线（apps/h5-client/src/，勿重复造轮子）

- 基础：`components/base/` 的 `Sheet`（浮层）/ `Chip`（动作）/ `Bar`（状态条）/ `Toast`（提示）
- 流程：`ConfirmSheet`（二次确认）/ `AttributeAllocator`（四维分配）/ `LoginPage` / `CharacterCreateSheet`
- 场景：`SceneView`（叙事优先 + 见闻 Tab）/ `ExitPad`（九宫格出口）/ `EntitySheet`（能力→动作）
- 战斗/模板：`CombatView`（手动战斗：状态 Bar + 战报演出 + 动作按钮 + 结果横幅）/ `CharacterSheet`（角色面板：四维当前·先天 + 武功门类/精通 + 装备/行囊）/ `TacticEditor`（战术模板：规则优先级 + 条件/动作 chips + 兜底 + 遮蔽警告）
- 挂机/任务/地图：`GrindBanner`（挂机状态条 + 停止原因）/ `AfkSheet`（修炼/行侠分段切换：武功+时长 / 已接击杀差事+战术模板+时长）/ `AfkReportView`（行止回响）/ `QuestPanel`（江湖足迹 + 任务卡）/ `MapSheet`（SVG 八向舆图：缩放/拖拽/回到位置）
- 社区/榜/重连/演出：`ForumView` + `PostComposer`（受控纯文本社区）/ `LeaderboardView`（双轨榜）/ `PvpView`（论剑：赛季余日 + 对手列表 + 邀战）+ `PvpReplayView`（战报叙事回放，与 PVE 共用 `battleEventLine`）/ `ReconnectingOverlay`（断线重连）/ `ArtPlaceholder`（首字印章插画占位）
- 样式：`styles/tokens.css` + `base.css` + `auth.css` + `scene.css`
- 数据模型：`lib/sceneTypes.ts` + `combatTypes.ts` + `characterTypes.ts` + `tacticTypes.ts` + `afkTypes.ts` + `questTypes.ts` + `forumTypes.ts` + `leaderboardTypes.ts`；客户端：`lib/authApi.ts` + `resumeClient.ts` + `reconnect.ts` + `sound.ts` + `effects.ts`（均 fetch/impl 可注入，Taro 可替换）
- 新界面先检查此处是否有可复用组件；扩展时保持 token 驱动 + 44px 触控 + aria。

## 4.2 姊妹项目借鉴约定（xkx2001-utf8 / sanguo-mud 提炼）

> 借鉴目录与 E14 映射见 `docs/sibling-borrowings.md`；此处为**可执行约定**。拿用边界：结构/交互/风格可借鉴，**xkx 的 MUD 特化逻辑（命令解析/`__xxx__` 拦截）不复制**（本项目服务端权威、无原始指令）；玩家可见文案一律原创。

- **stat token 命名**：经验/潜能/生存资源用独立 `--stat-exp` / `--stat-potential` / `--stat-qi` / `--stat-jing` 等（与 xkx tokens.css 对齐），不混用通用色；新状态先补 token 再使用。
- **分段控件泛型化**：互斥选择统一 `ChoiceRow<T>`（分段按钮，选中态玉色描边）；沿用禁原生 `<select>`；人物/物品列表仍用 chip。
- **浮层内反馈用 toast**：在 Sheet 内触发的操作反馈（学武/交易/装备等）用 toast 呈现（z-index 高于所有浮层，参考 xkx z-index:200）；**多行反馈合并为一条完整 toast**；内容与操作结果叙事一致，不拼接自定义文案。
- **attr-card 属性卡规范**（属性设置/重设共用）：左边框属性色 + `--font-display` 属性名着属性色；数值 `当前 → 新值`（新值着属性色）；分配状态条（满足玉色 / 不足或超出朱砂）；加减按钮到边界/超预算禁用。
- **战斗中悬浮动作条**（借鉴 xkx FloatingPerfBar）：战斗中出现在屏底居中、浮于浮层之上、可收起；**只在战斗中显示**，平时不占场景区。
- **NPC 能力 → 场景动作**：NPC 对话/交易/请托等动作由 NPC 定义（内容包 `npc` 能力字段）**生成**动作 chip，不写死——与"动作从世界中长出"一致（xkx inferNpcCapabilityActions 思想）。
- **新手引导方法**（sanguo first-session-ux 思想）：首启引导走"登录→建角→第一条任务→学武→首次战斗"闭环；**首战为教学展示**（必胜、弱敌、时长短，目标是第一次完整感受战斗文本与气血回响而非挑战）；引导提示用轻量组件（GuideTip 式 text + onDismiss），不打断主流程。
- **执行登记**：借鉴条目在 E14 各子任务执行记录登记来源（沿用 pkuxkx 登记纪律精神）。

## 4.3 PVE 战斗接线契约（E14.5）

- 开战用 `POST /combat/start { targetId }`；战斗内刷新/恢复用 `GET /combat/status`；每次玩家选择只发 `POST /combat/action` 的受控意图：`attack` / `recover` / `flee`，或 `{ action: "perform", performId }`。客户端不得计算绝招效果、消耗、冷却、胜负或掉落。
- `CombatView` 以服务端返回的 `state` 和有序 `events` 为唯一事实来源：`perform` 的 `performId` 驱动绝招高亮，`reward` 驱动收益摘要，`quest_progress` 后刷新 QuestPanel。不要从按钮点击本地预扣资源或乐观判定胜负。
- 战斗结束后先收束结果横幅，再在同一叙事回合展示收益/任务推进；逃跑和落败只给状态结果，不伪造奖励。断线恢复时优先请求 status，存在 ongoing 会话才重开战局浮层。
- 绝招按钮的可用态是服务端最终裁决；客户端可基于最近 state 做弱提示，但 400 错误须以 toast 显示服务端武侠文案，并保留当前战局。

## 4.4 人物簿接线契约（E14.2）

- 打开 `CharacterSheet` 时并发拉取 `GET /characters/me`、`GET /skills`、`GET /inventory`；服务端返回的角色、武功、行囊快照是唯一事实来源，客户端只做展示聚合。
- 行止、四维、经验、有效潜能、银两取角色快照；装备槽由行囊内 `equipped` 物品按 `weapon` / `armor` 派生，禁止在客户端另存一套装备状态。
- 请教/演练/参悟与佩上/卸下/使用均只提交受控意图；请求期间禁用重复操作，成功后重新拉取人物簿快照，再以一条 toast 告知结果。不得乐观扣减资源、改等级或改行囊数量。
- 放弃角色属于不可逆操作：人物簿只能触发 `ConfirmSheet`，确认成功后清空旧角色快照并回到建角流程。

## 4.5 挂机接线契约（E14.4）

- **先核实结算能力，再做入口**：`POST /afk/start` 接受某个 `kind` 不代表该作业会被 Worker 结算。实现或开放一种挂机方式前，检查 `services/worker/src/run.ts` 的分发和终态战报；未实现的种类不得以占位 UI 暗示可用。当前已开放两类：`study`（已学武功 + 时长）与 `quest`（行侠，见下条 DC-026）。
- **行侠（quest）接线**：差事选项只来自「已接且当前相位为击杀」的任务（客户端按首个未完成相位过滤，`toAfkQuestOptions`）；战术模板必填（服务端拒绝 `template_required` / `quest_unavailable`），启动时服务端固化模板快照，Worker 以固定种子自动结算（DC-026）。
- 打开行止面板时拉取 `GET /afk/status`、`GET /skills`、`GET /templates`、`GET /quests`；服务端状态、武功、战术与已接差事快照是唯一事实来源。启动/停止期间禁用重复操作；成功后用服务端返回作业更新横幅，不在客户端预扣精力、推算等级、伪造收益或预判胜负。
- `GET /afk/status` 返回 `{ active: false }` 是常态空态；运行中用 `GrindBanner` 展示面向玩家的行止和预计时间，不能泄漏 `phase` 等内部状态。
- resume 的 `pendingAfkReports` 只是未读 jobId 摘要；先保留这些 id，再用 `GET /afk/reports` 补拉完整叙事战报并按 id 打开 `AfkReportView`。服务端可能已在 resume 时标记已读，不能在后续请求中重新猜测“未读”。

## 4.6 论剑（PVP）接线契约（E14.6）

- 打开论剑面板时并发拉取 `GET /pvp/season` 与 `GET /pvp/opponents`；服务端赛季与对手快照是唯一事实来源。赛季信息只展示名 + 剩余日/状态，不泄漏内部时间戳。
- 发起对战是高风险操作：必须 `ConfirmSheet` 二次确认，只提交 `POST /pvp/match { defenderId }` 意图；胜负、积分变动与战报全部由服务端结算，客户端不得本地模拟。
- 匹配成功后拉取 `GET /pvp/matches/:id` 以事件流回放；叙事行与 PVE 共用 `battleEventLine`（combatTypes 导出），避免两套文案漂移。回放中 actor a=我方（挑战者）、b=对手（应战者）。
- 归档战报（G2 archive.sh 后 report 为 NULL）显示“已归档”提示而非空白；400 错误（无角色/赛季未开/次数已尽）以 toast 展示服务端武侠文案。

## 4.7 论坛接线契约（E14.7）

- 打开论坛时先拉 `GET /forum/sections`，进入板块拉 `GET /forum/posts?sectionId=`，打开帖子拉 `GET /forum/posts/:id`（含评论）；服务端数据是唯一事实来源。
- 发帖/回帖/举报共用 `PostComposer`：发帖带标题（≤24 字）、回帖与举报只填正文（回帖 ≤200 字，举报理由 ≤100 字）；纯文本由服务端把关，客户端不加工格式。
- 点赞后以 `POST /forum/likes` 返回值更新本地 `likedByMe`/`likeCount`（公开读接口不携带个人态）；举报走 `POST /forum/reports { targetType, targetId, reason }`，反馈用一条 toast（“已递呈坊主处置”）。
- 反馈（发帖/回帖/举报/点赞）统一用浮层内 toast；操作期间禁用重复提交。

## 5. 与已定项目决策的对齐

- **无原始指令**：玩家只见结构化动作与面板，不提供命令输入（调试命令仅内部）。
- **战术模板**：模板编辑器用结构化"条件→动作→优先级"（对应 game-core/tactic.ts），不是自由脚本；仅在对应挂机类型已被 Worker 真实结算后，才允许它参与挂机配置。
- **挂机**：GrindBanner 式状态条展示例行状态与停止原因；战报叙事化；未实现的作业种类不展示为可选行动。
- **单角色**：人物页展示角色成长/配置/行旅记录；放弃角色走二次确认。

## 6. 检查清单（E 阶段实现每屏自检）

- [ ] 30 秒内能回答"我在哪/有何变化/下一步分量"。
- [ ] 场景叙事优先，数字只在需要时出现。
- [ ] 动作从世界长出（场景动作 chip），无万能功能页。
- [ ] 数值带语义标签；无命令名裸露。
- [ ] 无原生 `<select>`；可点区域 ≥44px。
- [ ] 高风险操作有二次确认。
- [ ] 颜色全部来自 tokens；字体遵循字体栈。
- [ ] 挂机战报与绝招演出按 wuxia 文案规范。
- [ ] 每个可选挂机种类均已由 Worker 实际结算，并覆盖状态、停止、战报和 resume 未读回响。
