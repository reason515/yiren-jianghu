<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》设计决策登记（ADR）</strong></span><br/>
<span style="font-size: 18px;">决策编号 DC-xxx 为唯一标识 · 文档引用编号，不重述决策</span>

</div>

---

# 1. 使用说明

- 每个设计决策有唯一编号 **DC-xxx**；文档中引用时写「（DC-xxx）」，不重复叙述决策内容。
- **新增决策流程**：① 本表登记 → ② 更新受影响文档引用 → ③ 一致性检查（`scripts/check-doc-consistency.js` 落地后接入 CI）。
- 状态：✅ 已采纳 / 🔄 已被替代（见"被替代决策"） / ⛔ 已废弃。
- 权威基准：`docs/project-charter.md`（立项与技术决策）、`docs/design-and-development-plan.md`（计划与任务状态）；本表只记录**决策与变更**。
- 规范与方法：见 `yjh-design-docs` skill。

# 2. 决策登记表

| 编号 | 日期 | 标题 | 决策摘要 | 理由 | 影响文档 | 状态 |
|------|------|------|----------|------|----------|------|
| DC-001 | 2026-08 | H5 邀请制封测优先，微信小程序后续 | 先 H5 邀请码封闭试玩，成熟后适配微信小程序，再考虑 TapTap | 迭代最快；跨端约束第一天保持 | charter §2、计划 A 阶段 | ✅ |
| DC-002 | 2026-08 | 服务端权威、全程联网 | 剧情/探索/战斗/挂机/PVP/奖励全由服务端结算；断线自动重连恢复；客户端只展示与收集意图 | 反作弊、可审计、可重演；弱联网体验 | charter §3.2/§5、database-schema | ✅ |
| DC-003 | 2026-08 | 无原始命令行 | 玩家不接触 MUD 指令；交互一律结构化 UI + 服务端 API 事件 | 移动端可用性；内容生产方式现代化 | charter §1/§3.2、protocol.md | ✅ |
| DC-004 | 2026-08 | 独立新作，不兼容旧档 | 新代码仓、新账号、新数据模型；不兼容既有 MUD 账号/角色/LPC 存档 | 摆脱 LPC/存档包袱；全新技术栈 | charter §1/§3、README | ✅ |
| DC-005 | 2026-08 | 单账号单角色，可放弃重开 | 每账号一个主角色；二次确认放弃后立即可重开；旧档冻结 30 天供风控追溯 | 防刷号/多开/排行榜操纵；降低治理复杂度 | charter §4.2、database-schema §4.1 | ✅ |
| DC-006 | 2026-08 | 文字叙事为主 + 轻量插画 | 不建设可自由行走的 2D 场景；场景叙事、九宫格探索、卡片交互 | 控制内容管线与团队成本；聚焦文字体验 | charter §1/§2 | ✅ |
| DC-007 | 2026-08 | 在线单人沉浸 | 玩家不在地图中实时相遇或争抢资源；个人副本式在线探索 | 保持单机沉浸感；回避高并发共享世界 | charter §1/§5 | ✅ |
| DC-008 | 2026-08 | 离线挂机（服务端作业） | 挂机为服务端持久化作业，App 退出后继续；时长上限、资源消耗、失败条件、离线战报、每日递减收益 | 服务端可审计；不绑架玩家；奖励可控 | charter §5.2、afk.ts | ✅ |
| DC-009 | 2026-08 | 战术模板受控结构化 | 模板 = 条件→动作→冷却→优先级，多份可命名；服务端校验/执行/版本化；不开放脚本/正则 | 可稳定模拟、审计、防漏洞 | charter §5.3、tactic.ts | ✅ |
| DC-010 | 2026-08 | 手动探索纯手动，挂机按模板自动 | 玩家手动触发的战斗全手动按钮；挂机任务完全按所绑模板自动 | 避免操作预期混乱；挂机与手动分层 | charter §5.1/§5.3 | 🔄 |
| DC-011 | 2026-08 | 异步 PVP 单角色快照自动战斗 | 双方角色快照 + 固定种子自动结算；仅影响赛季积分与奖励，不掠夺；每日挑战次数限制 | 可复盘可审计可平衡；不惩罚离线玩家 | charter §6.1、pvp.ts | ✅ |
| DC-012 | 2026-08 | 排行榜双轨 | 长期成长展示 + 赛季竞技榜（4–8 周结算重置） | 后来玩家有竞争机会；限制长期挂机垄断 | charter §6.2 | ✅ |
| DC-013 | 2026-08 | 论坛纯文本受控 | 分区/公告/发帖/评论/点赞/举报；无私信/群聊/图片/交易；服务端敏感词+限流+审核 | UGC 治理可控；未成年人风险可控 | charter §7 | ✅ |
| DC-014 | 2026-08 | 前期无支付 | H5 封测与首个微信版本均不接入支付；仅预留商品/权益数据接口 | 先验证成长/挂机/赛季公平性 | charter §9 | ✅ |
| DC-015 | 2026-08 | 内容包驱动 | 地图/NPC/物品/技能/绝招/任务/数值全部 JSON/YAML 内容包 + Schema 校验 + 版本化；不建设 CMS | 可校验、可回滚、可预览；运营后台后续再说 | charter §8.1、content 包 | ✅ |
| DC-016 | 2026-08 | pkuxkx 仅研究来源 + 三类权利登记 | 只借鉴机制/结构；设定文本原创；未确认授权的代码素材不复制；筛选目录为唯一入口 | 降低版权风险；内容可追溯 | charter §8.2、pkuxkx-content-catalog.md | ✅ |
| DC-017 | 2026-08 | 技能制成长，无硬等级 | exp + 潜能 + 武功；单潜能货币（有效 = potential − learned_points）；银两单一货币 | 契合文字武侠的养成深度与挂机循环 | charter §5、growth.ts、economy.ts | ✅ |
| DC-018 | 2026-08 | 首版切片骨架 | 新手村 → 主城枢纽 → 单门派 → 一条可挂机日常线 → 战术模板战斗 + 异步 PVP 验证；地图/文本重写仅复用结构 | 收敛范围；端到端验证闭环 | 计划 M1–M4、pkuxkx-content-catalog.md | ✅ |
| DC-019 | 2026-08 | 门派原型 = 玄门剑宗 | 以 pkuxkx 武当为结构样本（武功门类/绝招组织/师徒链/任务地形），名称文本原创 | 体量紧凑、辨识度高、验证动态上限契约 | pkuxkx-content-catalog.md §3.2 | ✅ |
| DC-020 | 2026-08 | 数值重设计 + 集中参数表 | pkuxkx 公式仅作对照列；按移动端会话节奏重设计；所有数值集中在内容包参数表 | 封测集中调参；避免桌面端节奏错配 | 计划 C1/D1、paramsSchema | ✅ |
| DC-021 | 2026-08 | 账号体系平台无关 | 服务端 accountId 为主键；H5 邀请码测试登录；微信上线由玩家主动绑定 | 渠道无关、数据可迁移、不绑定单一平台 | charter §4.1 | ✅ |
| DC-022 | 2026-08 | 首版内容范围暂缓定义 | 从 pkuxkx 筛选哪些区域/门派/任务/技能稍后逐项评估；以筛选目录持续登记 | 避免内容规模失控；先验证玩法闭环 | pkuxkx-content-catalog.md §6 | ✅ |
| DC-023 | 2026-08 | PVE 战斗逐回合持久化 | 手动 PVE 每次 API 仅提交角色本回合意图；服务端保存可重演的战斗状态与有序事件，随后结算全部存活敌方回合；结束时统一发放收益并推进任务（DC-038 多方） | 落实服务端权威；支持断线恢复、审计和事件回放，避免客户端持有结算状态 | plan F0、database-schema §3.6、protocol.md、combat.ts | ✅ |
| DC-024 | 2026-08 | 战斗收益由 NPC 内容包定义 | battle NPC 在内容包以 `battleRewards` 定义经验、潜能与银两；物品仍由 `drops` 概率表决定。战斗结束由服务端基于会话种子结算，并以事件流回传 | 调参不改代码，收益来源可追溯；保持内容驱动与服务端权威 | schema.ts、dev-pack NPC、plan F0、protocol.md | ✅ |
| DC-025 | 2026-08 | 场景交互角色私有且服务端原子结算 | 房间静态物品每角色仅可拾取一次；商贩库存及买卖价由内容包 `goods` 定义；交谈、拾取、交易均须验证目标仍在当前房间，并在服务端事务内落库 | 落实在线单人沉浸、服务端权威与内容驱动，杜绝重复拾取、跨场景交互与并发交易造成的资源异常 | database-schema §3、protocol.md §7、计划 E14.1、sceneService | ✅ |
| DC-026 | 2026-08 | 行侠挂机按已接悬赏逐次结算 | 行侠挂机启动时绑定一桩已接、当前为击杀相位的任务与战术快照；Worker 每次结算只自动推进一次目标战斗，胜利后发放 NPC 战利并推进任务，任务完成后自动交差并结束作业；败逃或平局则结束并保留资源损耗；不自动重接可重复任务 | 复用既有任务、战术、掉落和战斗规则，保持离线作业的可审计与资源风险，同时避免无限自动刷取 | plan E14.4、afkService、worker/run、database-schema §3.7 | ✅ |
| DC-027 | 2026-08 | UI/UX V2 质感升级基线 | 全屏墨底补全（html/body/.app 背景）+ 字体自包子集化（ZCOOL XiaoWei / Noto Serif SC，woff2 随包，禁 CDN）+ 全局细墨滚动条 + 组件质感体系（按钮/chip 按压态、分类 tint、Sheet 上滑动画）+ 场景首字印章氛围（接入 ArtPlaceholder）+ 逐屏可读性打磨（角色/战斗/地图/论坛/榜单）+ 动效基线（仅 transform/opacity） | 修复白底浅字、字体回退、滚动条破坏沉浸等 P0 缺陷，把既有墨色武侠 token 体系真正"画出来"；实现分批次（P0/P1/P2/IA）验收 | docs/uiux-v2-spec.md、h5-client 样式与组件 | ✅ |
| DC-028 | 2026-08 | 主界面质感升级对齐登录页 | 主界面（场景/顶栏/九宫格/印章/导航）按登录页水墨舞台与金石印章质感升级：场景铺 atmosphere ink-* 弱化远景（fixed 底 + 内容 z-1，叙事可读优先）；顶栏铜金底边 + 发光 stat 点；ExitPad 简牍内凹面板 + 空位方位字罗盘暗示（CSS 伪元素，无点击语义）；印章纸纹 + 内染辉光 + 微斜；导航渐变浮起 + 激活指示线；`--stat-neili` 墨绿→黛紫以区分精力/内力 | 登录页 V2.1 已证明水墨舞台 + 金石印章的质感路径；主界面同为常驻页面，扁平黑底与其割裂；九宫格空位空洞感经多轮视觉模型走查确认 | docs/design-and-development-plan.md V2.8、h5-client 样式 | ✅ |
| DC-029 | 2026-08 | 主界面信息结构与滚动修复（V2.9） | 按用户反馈四项重构：①顶栏生存项显示「当前/上限」双值（服务端 characterService/sessionService 补 `vitalsMax`，与 sceneService 同一 `computeMaxVitals` 规则引擎）；银两改为独立金色胶囊徽章（货币非状态）；②移除场景页「当前要事」大卡（开放世界由玩家自行查任务列表，导航「任务」常驻）；③ExitPad 重构为「只显示可前往方向」的居中罗盘（方位语义保留：北行上/南行下/中为当前房间），不再渲染无出口空位；④修复滚动 bug——`.scene` 底 padding 由 16px 增至 76px（fixed 底导航 55px + 安全区），短视口下底部内容不再被导航遮挡且无法滚动；Tab 文案「人物N」改「此地人物/此地物品/可做之事」（避免占位符观感） | 用户实测反馈：①双值才合理、银两需明显区分 ②大卡引导过度 ③空位浪费空间 ④短屏无法滚动到底部内容；证据为真实手机视口走查 | docs/design-and-development-plan.md V2.9、h5-client 样式与组件、api 服务 | ✅ |
| DC-030 | 2026-08 | 见闻动态流 + 顶栏两行 + 页签化（V2.10） | ①顶栏生存项改两行 2×2 网格（气/精一行、精力/内力一行，银两徽章右侧居中），解决单行拥挤；②「见闻」重定义为**互动后的动态文字流**（参照 xkx EventLog）：与静态场景描述分离——描述留在标题下，新 `JournalFeed` 组件承接交谈/交易/拾取/战斗/交差/行止等事件的追加记录，折叠卡片显示最近 3 条、展开为全屏可滚动历史（自动跟随最新、可上翻）；③人物/物品/动作改**页签式**：无边框按钮 + 选中玉色下划线 + 计数徽章，内容入 `tab-panel` 内凹面板，不再像一排按钮 | 用户反馈：顶栏图表文字重叠需两行；「见闻」应为互动记录而非场景描述（参考 xkx 主界面 EventLog 设计）；任务/物品/动作需 Tab 页形式 | docs/design-and-development-plan.md V2.10、h5-client 组件与样式 | ✅ |
| DC-031 | 2026-08 | 字体体系与按钮规范（V2.11） | ①数字字体：引入 **LXGW WenKai 数字子集**（`--font-digit`，4.6KB，楷体笔意 + 全数字等宽 600）专供数值——ZCOOL 数字不等宽（305–584）对齐差、Noto 数字无楷韵；状态栏/银两/经验潜能/见闻数字统一用它；②**`<button>` 字体继承根治**：UA 默认 Arial 导致见闻折叠卡/Tab 字体不一致，全局 `button,input,select,textarea { font-family: inherit }`；③见闻关键字高亮：人名前缀（`名字：`）玉色、数字金色 + digit 字体（`renderRich` 正则拆分）；④按钮统一规范：chip/exit-cell 分类 tint 渐变 + 内阴影 + 按压位移，方向钮 min-width 48px（触控 44px 保留）；⑤docs/design-system.md 新增 §2.2 字体体系 + §3.4 按钮规范 | 用户反馈：数字对齐差且字体不配游戏、见闻/Tab 字体不一致、按钮偏大粗糙；探针证实 `.journal-summary`/`.scene-tabs button` 为 button UA 默认 Arial（非继承缺失，是 UA 样式覆盖） | docs/design-and-development-plan.md V2.11、design-system §2.2/§3.4、h5-client 样式 | ✅ |
| DC-032 | 2026-08 | 自然恢复 + 观察动作 + 见闻增强（V2.12） | ①**自然恢复机制**（参照 pkuxkx heart_beat 时间恢复）：`characters.last_heal_at` 时间戳 + 场景入口（getScene/move/act）delta 结算——每分钟恢复 qi/jing/jingli/neili（上限的 `params.regen.*PerMin` 比例），单次封顶 `maxWindowMinutes`(30) 防离线累积，食水不自动恢复；game-core 纯函数 `applyRegen`（确定性可测）；②**观察动作**：NPC 内容包新增 `description` 外观描述字段（14 个 NPC 补齐原创武侠文案），`observe { targetId }` 返回描述，客户端 EntitySheet 加「观察」按钮、描述入见闻（物品复用已有 description）；③**见闻增强**：展开改固定高度面板（260px 超滚，替代全屏 Sheet）；移动/观察条目支持 `mark` 关键词——地名青蓝色（#8fb0c2）与人名玉色/数字金色三色区分；④**状态栏数字对齐**：标签 min-width 2em 右对齐（气/精力长度差不再错位数字起点） | 用户反馈：见闻应固定高度滚动；移动场景名需特殊色且与人名区分；状态栏数字上下不对齐；气和精不自动恢复（对照 pkuxkx）；NPC/物品需观察按钮看外观描述 | docs/design-and-development-plan.md V2.12、design-system §2.2（mark 色）、protocol.md §7（observe + 恢复）、h5-client 组件与样式、api 迁移 0012 | ✅ |
| DC-033 | 2026-08 | 顶栏细轨进度条 + 交谈只入见闻（V2.13） | ①**顶栏深度重构**：生存项由「色点 + 纯文本」改为「标签 + 当前/上限双色读数 + 3px 细墨轨道填充」（2×2 grid 保留）；低值（低于 30%）fill/当前值转朱砂双警示；银两由现代胶囊改为竖排简牍印记（非 pill）；去掉发光色点 HUD 感；②**交谈去弹窗**：`talk` 结果只逐行 `addJournal`（首行人名前缀），关闭对话 Sheet；交易仍开 Shop Sheet（需买卖交互） | 用户反馈：数字对齐后顶栏仍丑；人物对话信息不该再弹窗打断阅读，应与观察一样进入见闻 | docs/design-and-development-plan.md V2.13、design-system §2.2、h5-client StatusBar/App | ✅ |
| DC-034 | 2026-08 | 见闻新条目打字机显现（V2.14） | 见闻折叠卡与展开面板中，**仅首屏之后新追加的条目**以每批 2 字、约 32ms 间隔打字机显现，打字中带淡玉底与墨笔光标，打完褪去；**多行串行由 `useJournalLog` 数据层保证**（`entries` 同时最多新增一行，settled 后再放出队列；交谈多句与观察同一 enqueue，禁止 forEach 一次写入）；首屏历史立刻全文；遵守 `prefers-reduced-motion` | 用户反馈：新见闻不易察觉；交谈仍一次多行——根因是一次写入多条 state，须在入队层串行 | docs/design-and-development-plan.md V2.14、h5-client JournalFeed / journalLog | ✅ |
| DC-035 | 2026-08 | 人物簿四页签重梳（V2.15） | 人物簿从单卷长列表改为**固定摘要 + 四页签**（状态 / 武学 / 行囊 / 档案；下划线页签 + 固定高度面板）：状态展示行止「当前/上限」细轨与四维；武学仅已学、空态提示；行囊佩挂（兵器+衣甲，无独立饰品槽）；档案含仪容短述、性别、改名、放弃；建角赠穿 `cubu_yi`；顶栏可点进人物；演练/参悟 toast 带花费与升段。**请教归属本轮不动** | 玩家实操：查生存/练功/配装被长列表淹没；对齐 uiux-v2「顶栏进人物」与 xkx 页签+仪容节奏（不借 enable/命令） | docs/design-and-development-plan.md V2.15、yjh-mobile-ui §4.4、h5-client CharacterSheet/StatusBar | ✅ |
| DC-036 | 2026-08 | 观察 NPC 多行仪容（V2.16） | `observe` NPC 返回 `lines`：外形（`description`）+ 武功水平阶位（`game-core` `buildNpcObserveLines`，与人物簿境界同档）+ 衣着/兵器（`equipment`→weapon/armor 名）；无装备不写空衣甲。客户端按 `lines` 串行入见闻。关键 NPC 补 equipment，外形文案与装备解耦 | 观察仅吐单行 description，与档案仪容结构不对齐；玩家打量对方应同步感知外形/武功/装束 | protocol.md §7、game-core/look.ts、sceneService、yjh-mobile-ui | ✅ |
| DC-037 | 2026-08 | 手动 PVE：自动普攻 + 手动高价值动作 | 探索开战后普攻由客户端按节拍提交 `attack` 意图、服务端逐回合权威结算；玩家只点绝招/回气/逃跑。不隐式自动施法（绝招须玩家点）。挂机仍按战术模板全自动（DC-009/026） | 对齐「看局势—抓时机」体验；与挂机分层清晰；保留服务端权威与可重演 | charter §5.1、protocol.md §5、yjh-mobile-ui §4.3、CombatView | ✅ |
| DC-038 | 2026-08 | PVE 真·同场 1vN | 一场会话可含多名敌人（上限 5）；回合序为玩家一动后全部存活敌人各一动；默认集火气最低者；胜=清场、败=主角气尽；收益与任务按击败名单累加。NPC 可选 `battleAllies` 同房拉入。PVP/行侠本轮仍 1v1 | 群战手感与内容扩展；引擎/协议一次到位，挂机与论剑边界不变 | combat.ts、protocol.md §5、database-schema §3.6、content schema | ✅ |
| DC-039 | 2026-08 | 武功双轨学艺（收费请教 / 门派拜师） | ①村里教头（`tuition_teacher`）当面按次缴银请教，不拜师不入门；②门派掌门（`apprentice_master`）正式拜师落库 `master_npc_id`/`sect_id`，本门请教免学费。请教一律同房、读 NPC `teaches`；每次耗精+潜能，收费轨另扣银（默认 `learnTuitionBase=2`，可被 `teaches.tuitionSilver` 覆盖）；0 级首学精耗 ×2。废除人物簿远程万能请教；建角赠 10 两起步银 | 对齐 xkx 武馆教头交银学武与门派收徒分流；无指令 GUI 用按次扣银；打通首学闭环 | numeric-baseline §2.1、protocol.md、database-schema §3.2、content schema、skillsService、h5 TeachSheet | ✅ |
| DC-040 | 2026-08 | 门派拜师辈分阶梯（拜谁学谁） | 门派请教仅向当前师父（`master_npc_id`）；NPC/角色有 `generation`（越小越尊，弟子=师父+1）。入门须拜 `recruit.acceptOutsiders` 的师兄（大师兄）；同门可改拜更高辈师父，门槛为 `recruit.minSkills`（首版用武功等级，门派贡献可后续加）。跨门派仍禁止 | 对齐 xkx `is_apprentice_of` + generation；先入门后升师 | protocol.md §8、database-schema、content schema、skillsService、EntitySheet | ✅ |
| DC-041 | 2026-08 | xkx 式武学全套（激发/招式/绝招学会/skill_power） | ①基本功+特殊功；人物簿 GUI 激发（有效等级=基本/2+特殊）；②招式挂特殊功达级解锁，普攻自动抽；③绝招须学会后手动（挂机模板仅已学）；④命中改 skill_power 分段 A/(A+B)；⑤可查看师父武功。无 prepare/完整 exert。升级可清空库 | 对齐 xkx enable/action/perform/combatd；GUI 无命令行 | numeric-baseline §2.3、protocol.md、database-schema、content schema、game-core、skillsService、CombatView/CharacterSheet | ✅ |
| DC-042 | 2026-08 | 新手生计挂机（无战斗换银/历练/潜能） | 新增 `afk.kind=grind`：内容包 `grindJobs`（村中杂役/溪边垂钓）；按时长发三件套+耗精；`maxExp` 限新手；不需战术。AfkSheet 默认「生计」。顺带野狗去群战降为 1v1 | DC-041 后新手打不过野狗、无起步资源；对标 pkuxkx 配药/钓鱼「时间换成长」语义，不做小游戏 | protocol.md §9、numeric-baseline §2.4、content grind_jobs、afkService/worker、AfkSheet、catalog | ✅ |
| DC-043 | 2026-08 | 在线/离线挂机双轨 + 历练用词统一 | `afk_jobs.presence`（online/offline）+ 心跳超时 pause；在线生计/行侠短 tick 高倍率见闻；离线实时累计；`settleJobNow` 供 status/stop/worker 共用；玩家可见「经验」统一为「历练」；可 wipe 库不兼容旧档 | 在线需心跳与见闻反馈、离线须可中途结算；用词混用影响认知 | protocol.md §9、numeric-baseline §2.4、database-schema §3.7、afkService/jobSettle、AfkSheet/App | ✅ |
| DC-044 | 2026-08 | 生存结算闭环：恢复入口补齐 + 食水消耗 | ①`settleCharacterVitals` 统一入口：场景交互 + `GET /characters/me` + `resume` 均按 `last_heal_at` 结算；新建角色写 `last_heal_at=now()`，空值仅初始化时钟不永久跳过；②`applyRegen` 同步按 `foodPerMin`/`waterPerMin` 消耗饱腹/饮水（绝对值，窗口封顶）；③客户端约 60s 轮询 + 移动后刷新顶栏 | 实测气精不回、食水不降：新建角色 `last_heal_at` 空导致结算早退；顶栏只在 resume/开人物簿刷新；DC-032 暂缓的食水消耗补齐 | protocol.md §7、vitals.ts、vitalsSettle、迁移 0016、h5 App | ✅ |
| DC-045 | 2026-08 | 在线生计真实跑图（合圈发奖） | 在线 `grind`：内容包 `hubRoomId`/`route`/`workRooms`/`roundGain`；先白名单导航到枢纽，再沿回路逐步改 `room_path`，合圈才发奖；挂机 running 禁手动 move；任意处可开活。离线仍 `hourlyGain` 按时长、不跑图 | 对齐 xkx 钓鱼/配药「人在地图干活、干完一轮拿一轮」；见闻轮换不够真 | protocol.md §9、numeric-baseline §2.4、content grind_jobs/rooms、game-core grindCircuit、jobSettle/afkService/sceneService、H5 | ✅ |
| DC-046 | 2026-08 | 机制公式进内容包 DSL | 内容包根目录 `mechanics.yaml` 为全局系数+命名公式+分段表+实体索引的唯一生效源；安全表达式引擎（白名单函数，禁 eval）在加载时编译；`params` 为 `coeffs` 兼容别名。控制流（战斗循环/挂机状态机）仍留 game-core | 便于 review/调公式且运行时直读同一文件；修正 DC-020「公式形态留代码」边界 | mechanics.yaml、content expr/mechanics、numeric-baseline、yjh-content-pack | ✅ |
| DC-047 | 2026-08 | 后天四维 + 装备进战 + 招式 dodge | ①后天四维为查询叠算（非升级写库）：force/10→con、dodge/10→dex、unarmed/10→str、knowledge/10→int；面板 `cur`=`base`+加成，vitals/战斗吃后天。②已装备 `item.stats` 叠加攻防（及 dodge/parry）。③招式 `dodge` 加成攻方命中侧有效等级。不做经络/年龄/hit_ob | 对齐 pkuxkx attribute.c 体感；catalog 已纳入装备与 dodge 修正须接线 | numeric-baseline、protocol、game-core attrs/combatant/combat、characterService、combatantFactory | ✅ |
| DC-048 | 2026-08 | 加力 + 伤势双轨 + 运功子集 | ①加力档位 0–3：普攻耗内换伤（yaml 系数）。②伤势：伤害按比例压 `effQi`，回气/heal 不超过 eff；`cure_qi` 抬 eff。③运功子集：疗伤（抬 eff）+ 护体 buff（临时防御）；内容化绝招，非完整 exert 树（不违 DC-041） | 短局战斗决策；借 pkuxkx enforce/damage/force 语义裁剪 | numeric-baseline、protocol、combat/perform/vitals、content performs/items | ✅ |
| DC-049 | 2026-08 | 回合 busy + 命中钩子 + 演示毒 | ①绝招/运功后 `busyTurns` 回合内禁普攻（可回气/逃跑/疗伤类）。②dodge/parry/hit 事件带 `hook` 标记供战报闲笔。③至多一种演示毒（回合开始扣气）。不做秒级心跳、完整 condition 目录 | 节奏与呈现；移动端回合锁 | numeric-baseline、combat.ts、CombatView/叙事 | ✅ |
| DC-050 | 2026-08 | 战斗读感：HUD 回放 + 攻防交换 + 悬念软化 | ①客户端血条按已显现战报行回放，禁止终态抢跑。②回合内玩家动作块与敌还手之间插入 `exchange` 停顿 + 行动方高亮。③命中率夹逼（floor/ceil）、伤害浮动加大、弱打强 sqrt 软帽、`performBusyTurns=2`。不引入秒级双心跳/暴击/反震 | 对照 xkx「一招闭环」读感与悬念杠杆；修扣血错位、对砍感、稳赢稳输 | numeric-baseline、mechanics.yaml、combat.ts、CombatView/combatReplay、yjh-combat-presentation、sibling-borrowings | ✅ |
| DC-051 | 2026-08 | 自然恢复对齐 xkx heal_up 绝对值 | ①废弃上限比例 `*PerMin`；改为每拍 `con/3+maxNeili/10`（精同构 +maxJingli）、精力 `(str+dex)/4`、内力 `forceLevel/2`，×`(60/tickSeconds)`×分钟（`tickSeconds=9.5`）。②饥渴不回气精。③贴 eff 后缓慢抬伤势上限。④`settleCharacterVitals` 读写 `eff_qi`/`eff_jing`（修非空血无法回升）。场外 exert recover / 歇脚另案 | 实测比例回速约为 MUD 1/5～1/10；对齐桌面站桩回血手感 | mechanics.yaml、schema、vitals.ts、vitalsSettle、numeric-baseline、protocol.md | ✅ |

# 3. 被替代决策（变更历史）

| 旧决策 | 被编号替代 | 说明 |
|--------|-----------|------|
| 初始设想"纯离线单机 + 本地存档" | DC-002 | 改为服务端权威全程联网（用户明确"基本要求全程联网"） |
| 初始设想"玩家可实时相遇" | DC-007 | 改为在线单人沉浸（用户明确"按无法相遇考虑"） |
| 微信小程序首发 | DC-001 | 改为 H5 邀请制封测优先（用户调整发布路径） |
| 首发考虑 TapTap 小游戏 | DC-001 | 列为 H5→微信之后的后续渠道 |
| DC-010 手动战斗全手动按钮 | DC-037 | 改为自动普攻 + 手动绝招/回气/逃跑；挂机模板自动不变 |
| DC-035「请教归属本轮不动」中远程请教路径 | DC-039 | 请教改为当面请教（收费/拜师双轨）；人物簿不再远程 learn |
| DC-039 门派「同门任一师父可请教」 | DC-040 | 改为仅向当前师父请教；先大师兄后掌门 |
| DC-035「不借 enable」与门类最高级进战斗 | DC-041 | GUI 激发 + 有效等级；命中改 skill_power；招式/绝招学会制 |
| DC-020 战斗线性命中/伤害简化口径（对照列）中「生效列仍为线性」 | DC-041 | 生效列改为 skill_power + 招式系数；params 旧线性系数保留作伤害基底 |
| DC-032「食水不自动恢复 / 暂不实现饥饿」 | DC-044 | 同 tick 按绝对值消耗 food/water；恢复入口扩展至读档与顶栏轮询 |
| DC-032/044「气精按上限比例 *PerMin 恢复」 | DC-051 | 改为 xkx heal_up 绝对值（con/内力分母 + 9.5s 拍）；饥渴阻回气精；读写 eff |
| DC-020「公式形态留代码、只改参数表数字」 | DC-046 | 系数与公式表达式均进 `mechanics.yaml`；控制流仍留代码；旧 `params.json` 退役 |

# 4. 一致性检查

- 引用完整性脚本 `scripts/check-doc-consistency.js` 待落地（设计文档引用「（DC-xxx）」必须存在于本表）。
- 与协议契约（`pnpm test:docs`）和内容包校验（`pnpm content:validate`）构成三层一致性机制。
