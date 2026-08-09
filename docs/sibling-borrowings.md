<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》姊妹项目借鉴清单</strong></span><br/>
<span style="font-size: 18px;">xkx2001-utf8 Web 客户端 · 《汉末江湖录》设计文档 → 本项目 E14 试玩闭环</span>

</div>

---

# 1. 定位与边界

借鉴来源（同作者生态，内部借鉴合理）：
- `D:\code\xkx\xkx2001-utf8\web\`（侠客行 MUD Web 客户端——**工程与交互实现**）
- `D:\code\sanguo-mud\docs\design\`（《汉末江湖录》——**设计方法论**）

**拿用边界**：
- UI 风格 / 交互模式 / 组件**结构**可直接借鉴；xkx 组件含 MUD 特化逻辑（命令解析、LPC 对接、`__xxx__` 拦截）**不复制**——本项目服务端权威、无原始指令，按本项目 API 语义重写。
- 玩家可见文案**一律原创**（各项目有独立文案规范）。
- 借鉴条目在 E14 各子任务执行记录中登记来源（沿用 pkuxkx 登记纪律的精神）。

# 2. UI 风格（墨色武侠，两项目共同基因）

本项目 `apps/h5-client/src/styles/tokens.css` 已有同源体系（ink/paper/jade/cinnabar/attr-*/skill-*/item-*/mastery-* + 本项目独有 quality-*/gold）。

**对照补漏**（xkx `web/concept/tokens.css` 有而本项目暂缺）：
- `--stat-exp` / `--stat-potential`（经验/潜能独立 token——本项目当前可能复用其它）
- `--stat-qi` / `--stat-jing` 等 stat-* 系列命名一致性核对
- xkx 无 quality-*（本项目独有，保留）

**字体**（两项目一致）：`--font-display`（标题/主按钮，ZCOOL XiaoWei）+ `--font-body`（正文，Noto Serif SC）；禁 Inter/system-ui 主字体。本项目已实现。

# 3. 组件借鉴（按 E14 子任务映射）

| xkx 组件 | 本项目对应 | 拿用方式 |
| --- | --- | --- |
| **ShopView**（交易面板） | **缺**（E14.1 交易） | 结构借鉴：商品列表/买入/卖出/库存/货币；本项目用 content `goods` + economy API |
| **ChoiceRow**（泛型分段按钮，禁 select） | AttributeAllocator 有类似 | 抽成通用 `ChoiceRow<T>`（E14.10 易用性） |
| **TrainSheet / buildPracticeOptions** | 缺（E14.2 学武面板） | 结构借鉴：可学武功选项/学/练动作；本项目 learn/practice/study API |
| **CharacterSheet 五页签 + 行内展开** | V2.15 四页签人物簿（DC-035） | 借鉴页签分层与点开再动手；本项目定为状态/武学/行囊/档案，不借 enable/prepare/wimpy/命令刷面板；仪容短述借鉴 look me 结构 |
| **FloatingPerfBar**（战斗悬浮绝招，战斗中屏底） | CombatView `.combat-float-bar` | 已落地：自动战悬浮动作条（绝招/回气/逃跑），进行中可收起 Sheet（DC-037） |
| **GrindBanner**（挂机状态条 + 停止原因） | 已有 | 对照：停止原因「知道了」关闭模式（本项目已类似） |
| **GuideTip**（轻量引导提示） | 缺（E14.11） | 简单组件：text + onDismiss，配首日引导流程 |
| **GraphicalMap / RoomGraph**（语义网格地图） | MapSheet SVG 已有 | 语义网格坐标思想对照（本项目 map-design skill 已吸收） |
| **ReconnectingOverlay** | 已有 | 对照断线重连 UI 状态 |

**不借鉴**：xkx 的 desktop 规则编辑器（本项目 TacticEditor 结构化 chips 已定）、parser/ws/ruleEngine（MUD 特化，本项目架构不同）。

# 4. 交互模式借鉴

- **toast 反馈约定**（xkx）：浮层内触发命令的反馈用 toast（z-index 高于浮层），内容与见闻一致；多行反馈合并为一条。→ E14.10 toast 体系对齐。
- **attr-card 规范**（xkx）：属性卡左边框属性色 + 当前→新值 + 分配状态条 + 加减禁用态。→ 本项目 AttributeAllocator 对照补全。
- **场景动作流水线**（xkx `inferNpcCapabilityActions` → merge → label）：动作标签双处覆盖陷阱。→ 本项目 actions 来自内容包（无此坑），但「NPC 能力 → 场景动作」的生成思想可用于 E14.1（NPC 对话/交易/请托动作组装）。

# 5. 文档/方法论借鉴（sanguo-mud）

- **first-session-ux-v3（首日闭环）**：注册→创建→首区→首战→入城→首日终点的全流程设计 + 七原则（**首战教学展示**：必胜弱敌纯自动 30–45s；主线被动暗线；首日零出身差异）。→ **E14.11 新手引导的直接参考**（按本项目叙事/机制改写）。
- **design-baseline.json + check-doc-consistency.js**：设计基准单一事实来源 + 自动一致性检查。→ 本项目 design-docs skill 已提到移植思路；**`scripts/check-doc-consistency.js` 已落地**（E14.12），接入 `pnpm test:docs-design`（CI quality 同步，与 `pnpm test:docs` 协议契约并列）。
- **mobile-uiux-v1 + 审计轮次**（多轮审计/修复复核）：本项目 design-docs skill 已移植。

# 6. 工程工具借鉴

- xkx `scripts/generate-*.mjs`（从源数据生成 `.generated.ts`）：本项目内容包 CLI（validate/preview/bundle）已覆盖同类需求，无需引入。
- sanguo `scripts/check-doc-consistency.js`：见 §5，已移植（`scripts/check-doc-consistency.js` + `pnpm test:docs-design`）。

# 7. 执行登记

- E14.1 交易面板 → 借鉴 xkx ShopView（登记：sibling/xkx ShopView）
- E14.2 学武面板 → xkx TrainSheet/buildPracticeOptions
- V2.15 人物簿四页签 → xkx CharacterSheet（页签分层 + 行内展开 + 仪容结构；不借 MUD enable/命令）
- E14.5 战斗悬浮 → xkx FloatingPerfBar
- E14.10 易用性 → xkx ChoiceRow / attr-card / toast 约定
- E14.11 新手引导 → sanguo first-session-ux-v3（改写）
- ~~新待办：移植 check-doc-consistency（design-docs §4 落地）~~ **已完成**（E14.12：`scripts/check-doc-consistency.js` + `pnpm test:docs-design`，CI quality 同步）
- V2 批次1–4 + 收尾 → 见 §8（sibling/xkx Chip·Sheet·attr-card、sibling/sanguo 行旅簿·导航收敛）

# 8. UI/UX V2 借鉴闭环（DC-027，2026-08 实战）

V2 把 §2–§5 的借鉴从「设计意图」推进到「真实落地」，并新增若干**本项目自产**的视觉决策。全部经公网部署 + 真机走查验证。

## 8.1 借鉴落地表（来源 → 落地 → 实测）

| 来源 | 借鉴点 | V2 落地 | 实测结果 |
|------|--------|---------|----------|
| xkx `app.css` chip 体系 | 分类色 tint（action 玉色 / npc 朱砂 / item 蓝灰）+ 选中态加深 | Chip 质感体系：`action/perform/npc/item/danger` 分类 tint + `:active` 按压态；**perform 金色**为战斗绝招专用 | 公网实测：按压反馈、主次分明 |
| xkx `app.css .sheet` | 上滑入场 `translateY(16px)→0` + 0.2s | Sheet `@keyframes sheet-up` 挂载即播（本项目组件无 open class 切换，animation 更可靠） | 实测：浮层上滑 |
| xkx attr-card 规范 | 左彩条属性色 + 当前→新值 | 四维改 2×2 卡片网格：属性色左边框 3px + 底色交替 + 圆角 | 实测：2 列 × 4 卡 |
| sanguo §4 行旅簿 | 深漆墨底 + 宣纸字 + 材质分层（非纯黑） | 全局墨底容器规则 + `--bg-noise` 宣纸噪点纹理（SVG data-URI 5% 不透明度） | 实测：背景不再"死" |
| sanguo §3 | 六个主场景 / 底部导航收敛 | 导航 8–9 项 → **5 高频 + 「更多」抽屉**（榜单/地图/离开）；战局为情境按钮 | 实测：6 项 15px 主次分明 |
| sanguo §4.3 | 场景卡细线分栏 | 保持（防回归） | — |
| sanguo 登录徽记 + 开场画册（`design/mobile-uiux-v1.html`） | 圆形山水徽记 + 分章开场画册的"先震撼后入场" | 登录页水墨远景（孤月/三层山峦/月下孤影/松柏灯笼）+ 三卷竖排开场卷轴（只播一次可略过，见 yjh-mobile-ui §4.13） | 视觉模型走查：登录 9.5/10、卷轴"达到终版标准" |
| sanguo first-session-ux（来处/序章理念） | 创建前先"认识处境再做选择" + 开场交待背景 | 建角序章（V2.3）：全屏两步——①卷轴竖排五句交待"一人一江湖"（江湖万里/只此一人/此去无人相送/名姓自取/恩怨自了）+ 引导句 + 立名闯荡 → ②立名与根基表单；序章文案原创（一人一江湖主题） | 视觉模型：序章"概念非常棒"；390px 实测无溢出 |
| xkx `MobileApp.tsx` EventLog（见闻日志组件，V2.10） | 见闻 = 互动后的动态文字流：折叠卡片（标题 + 虚线分隔头 + 最近 4 条单行摘要）→ 点击展开全屏 Sheet 滚动历史（`slice(-100)` 上限、自动跟随底部 `pinToBottom`、上滑翻看、非底部时悬浮「最新」按钮）；战斗信息在见闻展示 | V2.10 `JournalFeed`：场景描述（静态）与见闻（动态）分离——折叠卡显示最近 3 条 → 展开全屏滚动历史；App 层 `addJournal` 统一挂钩交谈/交易/拾取/战斗/交差/行止/移动事件；对话逐行入见闻且首行带人名前缀（`王五：……`）；自动跟随 + 上滑翻历史 + 「最新」按钮 | 实测：与村长交谈 → 对话逐行入见闻 → 展开翻看全部历史；362 用例全绿 |
| xkx `app.css .vitals`（顶栏 grid 2 列，V2.10） | 顶栏生存项 2×2 网格两行排布（避免单行拥挤）：每项 小圆点/标签 + 数值，底部另起一行放食/饮 | V2.10 顶栏两行：气/精一行、精力/内力一行；V2.13 在网格上叠加细轨进度条 + 双色读数（非纯进度条），银两改竖排简牍印记 | 实测：两行网格保留；V2.13 去掉色点 HUD 感 |

**不借鉴**：xkx 胶囊圆角 chip（本项目保留矩形轻边框，已定组件语言）；xkx 顶栏纯进度条无数字（本项目始终保留当前/上限双值——V2.13 是「细轨 + 数字」而非「无数字进度条」）；sanguo 汉末器物元素（题材不同）；双方文案一律原创。

## 8.2 本项目自产视觉决策（非借鉴，V2 新定）

- **全局墨底容器规则**：`html/body/#root/.app` 必须持有背景——P0 根因（白底浅字）不在配色而在容器缺背景规则。
- **字体自包禁 CDN**：GB2312 子集 woff2 随包（ZCOOL 2.6MB + Noto ×2 ≈ 5MB）；Google Fonts 国内不可达，xkx 的 CDN 方案不可照搬（见 team skill `chinese-font-selfhost`）。
- **首字印章**：`ArtPlaceholder`（E13 建、长期孤儿组件）接入登录页与场景标题，承担 DC-006 轻量插画边界。
- **场景「当前要事」卡片**：已接任务 + 相位中文（`PHASE_LABEL`，不泄漏内部类型名）+ 查看入口，承接场景下半屏留白。**（V2.9 已移除——开放世界玩家自行从导航「任务」查列表，避免引导过度，见 DC-029）**
- **榜单金银铜徽章**、**战斗主攻击实底玉色按钮**、**地图微弧贝塞尔连线**（按边索引方向交替，不穿节点）。
- **登录页水墨远景 + 开场卷轴**（V2.1）：纯 CSS/SVG 无外部资源——孤月月晕、疏星、三层空气透视山峦、月光洒落层、月下孤影（持剑剪影 + 朱砂剑穗 + 背光晕）、松柏 + 朱砂灯笼、三卷竖排宣纸立卷（localStorage 只播一次）。技法细节与踩坑（内联 SVG 显式宽高）见 yjh-mobile-ui §4.13。
- **建角全屏两步流程**（V2.3）：`ink-screen` + `ink-backdrop` 远景 + 卷轴序章 + 宣纸控件成对（`.input.paper` / `.btn.paper`）+ 回想序章返回；attr-row 用 `minmax(0,1fr)` 防 hint 撑爆（grid 经典坑）。

## 8.3 方法论沉淀（超出姊妹项目范畴，已入团队 skill）

- **`ui-visual-audit`**（team-ai-skills）：证据驱动走查——视觉模型会误判（曾把墨色读成白色），必须 CSS 探针交叉验证；高频 P0 清单（容器缺背景/字体未自包/滚动条未定制/box-sizing 溢出/body 字体基线缺失）。
- **`chinese-font-selfhost`**（team-ai-skills）：字体子集化全流程 + fontsource 21MB 坑（283 分片）vs 自子集化 5MB（3 文件）实测对比。
- 两 skill 的方法均在本项目 V2 批次 1–4 实战中验证，后续姊妹项目（xkx Web 客户端等）可直接复用。

## 8.4 部署侧教训（V2 实战踩坑，防复发）

- **部署窗口 502**：`mv dist dist.bak` + `compose up` 重建 api 的秒级间隙，浏览器 `/api/` 请求会 502——非故障，等几秒自愈；access log 无 502 佐证。
- **SPA fallback 吞 `/health`**：Nginx `try_files $uri /index.html` 会把 `/health` 回退成 index.html，探针拿不到 JSON——须加 `location = /health` 直通（已修，`deploy/nginx.yiren-jianghu.conf`）。
- **浏览器缓存旧 bundle**：部署后用户"看不到效果"先强刷/比对 bundle hash，非部署失败。
