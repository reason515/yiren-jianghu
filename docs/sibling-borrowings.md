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
| **FloatingPerfBar**（战斗悬浮绝招，战斗中屏底） | CombatView 手动按钮 | 交互借鉴：战斗中悬浮动作条 + 可收起（E14.5） |
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
- **design-baseline.json + check-doc-consistency.js**：设计基准单一事实来源 + 自动一致性检查。→ 本项目 design-docs skill 已提到移植思路但 `scripts/` **未落地**——**登记待办**（与 `pnpm test:docs` 协议契约并列的设计侧检查）。
- **mobile-uiux-v1 + 审计轮次**（多轮审计/修复复核）：本项目 design-docs skill 已移植。

# 6. 工程工具借鉴

- xkx `scripts/generate-*.mjs`（从源数据生成 `.generated.ts`）：本项目内容包 CLI（validate/preview/bundle）已覆盖同类需求，无需引入。
- sanguo `scripts/check-doc-consistency.js`：见 §5，待移植。

# 7. 执行登记

- E14.1 交易面板 → 借鉴 xkx ShopView（登记：sibling/xkx ShopView）
- E14.2 学武面板 → xkx TrainSheet/buildPracticeOptions
- E14.5 战斗悬浮 → xkx FloatingPerfBar
- E14.10 易用性 → xkx ChoiceRow / attr-card / toast 约定
- E14.11 新手引导 → sanguo first-session-ux-v3（改写）
- 新待办：移植 check-doc-consistency（design-docs §4 落地）
