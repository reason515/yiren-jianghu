<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》墨色武侠设计系统</strong></span><br/>
<span style="font-size: 18px;">V2.2 · 由登录页 V2.1 实践提炼的可复用视觉资产</span>

</div>

---

# 1 定位

本文档是《一人江湖》H5 客户端的**视觉设计系统**，把已上线验证的界面视觉语言（墨色武侠、水墨远景、宣纸质感）沉淀为可复用资产，供后续界面改造直接取用：

- **Token 层**：`apps/h5-client/src/styles/tokens.css`（颜色/字体/触控/阴影/纹理）
- **原语层**：`apps/h5-client/src/styles/atmosphere.css`（意境背景图层 ink-*、宣纸面 paper-card、古籍竖排 v-cols/v-col、动效 keyframes）
- **组合层**：各界面样式文件（如 `auth.css` 登录页 = ink-* 原语组合 + 卷轴 paper-card/rolls + v-cols）
- **规范层**：`.pi/skills/yjh-mobile-ui`（UI/UX 设计规范，§4.13 登录页与开场卷轴）

界面改造流程：先看本文档找现成资产 → 组合原语 → 不足再补 token/原语（新颜色必须先补 token）。

# 2 Token 体系（tokens.css）

## 2.1 基础色板

| Token | 值 | 用途 |
|---|---|---|
| `--ink` / `--ink-lift` / `--ink-soft` | #12100e / #1a1714 / #242119 | 墨底三层（页面/浮层/控件面） |
| `--paper` / `--paper-dim` / `--paper-faint` | #e8dfd0 / #b9ad98 / #7f7565 | 宣纸字三阶（主/次/弱） |
| `--jade` / `--jade-bright` | #5f8f78 / #8fbfa6 | 玉色：可行动 |
| `--cinnabar` | #b54a3a | 朱砂：高风险/印章 |
| `--gold` / `--gold-muted` | #c9a869 / #8d7040 | 铜金：次级强调 |
| `--line` / `--line-strong` | 纸色 12%/22% | 细线/强线 |

## 2.2 意境原语 token（V2.2 新增）

| Token | 值 | 用途 |
|---|---|---|
| `--moon` | #e3d5b4 | 孤月本体（月晕渐变收尾） |
| `--paper-surface` / `--paper-surface-deep` | #efe6d2 / #e0d2b4 | 宣纸亮面/深面（卡片、按钮、输入框） |
| `--paper-ink` | #171209 | 纸上墨字 |
| `--wood` / `--wood-light` | #5d4426 / #8a6a40 | 紫檀木轴（深/亮） |
| `--lantern` | #c4644a | 朱砂灯笼 |

## 2.3 其它

状态资源（qi/jing/jingli/neili/food/water/potential/exp）、四维（str/int/con/dex）、武功门类、精通 6 级、物品、品质色均见 tokens.css；字体 `--font-display`（ZCOOL XiaoWei 标题/主按钮）+ `--font-body`（Noto Serif SC 正文）；触控 `--touch-min: 44px`、安全区 `--safe-b/--safe-t`；纹理 `--bg-noise`（SVG data-URI 5% 噪点，破纯黑扁平）。

## 2.4 文字颜色规范（V2.5：三层体系 + 类/项区分）

任何界面文字着色先对号入座，分三层：

**第一层 · 基础文字阶**（正文/叙事，永不染色）

| Token | 用途 |
|---|---|
| `--paper` | 主文本（场景叙事、正文） |
| `--paper-dim` | 次级（说明、提示、元信息） |
| `--paper-faint` | 弱化（时间戳、占位、弱强调） |

**第二层 · 语义强调色**（动作/状态，全局统一语义）

| Token | 语义 |
|---|---|
| `--jade` / `--jade-bright` | 可行动、选中、当前可做 |
| `--cinnabar` | 危险、警示、印章、朱批 |
| `--gold` / `--gold-muted` | 次级强调、货币、珍品点缀 |

**第三层 · 领域色**（数据分类）

**核心原则（V2.5）：颜色用于区分「类」，不用于区分「项」。**

- **需要颜色的「类」**：跨类型扫读场景——物品类型（武器/防具/药品/食物）、武功门类（内功/外功/轻功/招架/知识）、品质等级（凡/良/珍/名）、状态资源（气/精/内力）。靠颜色快速归类。
- **不需要颜色的「项」**：同类型列表项——四维四行（膂力/悟性/根骨/身法）、装备槽位、任务列表等。汉字/符号即区分，用**统一墨色 + 排版层级**（display 字体、字号、字重、tabular-nums）建立层次，古籍刻本式克制。V2.4 曾给四维设矿物色（赭石/黛蓝/松绿/琥珀），V2.5 推翻：四维统一 `--paper`，仅靠文字与字号区分。

领域色若设，仍遵循水墨矿物色原则：

1. **墨感**：色相取自中国画矿物颜料（赭石/黛蓝/松绿/琥珀/花青…），饱和度 ≤55%、明度 45–60%，保证墨底（#12100e）上可读且不跳脱；
2. **色相隐喻**：每域一色一义（如物品·武器=赭石土铁、武功·内功=玉色生机），后续新增领域色先在此登记隐喻；
3. **双色纪律**：领域色只用于**标签与读数**（类型名/数值），正文说明文字永远用基础阶；
4. **文字标签并存**：品质/精通等不能只靠颜色，必须带文字（凡品/良品/珍品/名器）。

| 领域 | Token | 色相隐喻 | 状态 |
|---|---|---|---|
| 物品类型 | `--item-*` | 武器·赭石土铁 / 护具·黛蓝 / 药物·黛紫 / 食物·藤黄 / 钱·铜金 | 🔄 后续批次按矿物色对齐 |
| 武功门类 | `--skill-*` | 内功·玉色生机 / 外功·赭石 / 轻功·黛蓝 / 招架·青灰 / 知识·藤黄 | 🔄 后续批次按矿物色对齐 |
| 状态资源 | `--stat-*` | 气·朱砂红 / 精·黛蓝 / 内力·玉色 / 食物·藤黄 / 水·黛蓝 | 🔄 后续批次按矿物色对齐 |
| 品质 | `--quality-*` | 凡·纸 / 良·黛蓝 / 珍·黛紫 / 名·赭金 | 🔄 后续批次按矿物色对齐 |

**数值字体规范**：

- 读数一律 `font-variant-numeric: tabular-nums`（分配/计数时数字不抖动）；
- 重要读数 `font-weight: 600`（Noto Serif 600 已自包），**字号与正文同级（16px），不放大**（V2.4 曾设 19px 偏大，V2.5 收敛）；
- 双数标明语义（当前/先天、当前/上限）：当前值墨色加粗，基准值 `--paper-faint` 弱化。

**迁移路线**：V2.5 四维已统一墨色（同类项不染色）；物品/武功/状态/品质色按新界面或走查批次逐个对齐矿物色原则，每批截图对比防回归。


# 3 意境原语（atmosphere.css）

## 3.1 远景舞台

在任意 `position: relative` 容器内铺 `<div class="ink-backdrop">`，然后按序叠加图层：

| 类 | 作用 | 说明 |
|---|---|---|
| `.ink-screen` | 全屏墨色舞台 | 登录/建角/序章等全屏页容器：100dvh + overflow hidden + 墨底 |
| `.ink-content` | 内容层 | 舞台之上的居中内容：z-index 2 + flex 居中 + 安全区内边距 |
| `.ink-backdrop` | 舞台容器 | absolute inset 0、overflow hidden、pointer-events none |
| `.ink-stars` | 疏星 | 多 radial-gradient 点，点缀夜空破空洞 |
| `.ink-moon` | 孤月 + 月晕 | 右上，`::before` 月晕融入夜空（避免"贴图感"）；呼吸动画 |
| `.ink-horizon` | 地平天光 | 层山后月下薄雾，空气透视 |
| `.ink-range.back/.mid/.front` | 三层山峦 | 远雾青（blur+雾顶）→ 中墨褐（染月光+山脊 drop-shadow 轮廓光）→ 近墨黑；**山体必须提亮到可辨层次，否则底部"死黑"** |
| `.ink-lights` | 月光洒落 | 径向暖光 blur 覆盖山坳，破底部死黑 |
| `.ink-figure` | 月下孤影 | 前景右下剪影 + `::before` 金色背光晕；⚠️ 内部 SVG **必须显式 width/height**（默认 300×150 会撑开定位） |
| `.ink-pine` / `.ink-pine-l` | 松柏剪影 | 压底部角落（SVG 树形） |
| `.ink-lantern` | 朱砂灯笼 | 暖光呼吸，人情味点缀 |
| `.ink-mist.m1/.m2/.m3` | 流雾 | ≥3 条（底部最亮）交替漂移，仅 transform/opacity |
| `.ink-vignette` | 暗角 | 电影感收边，底部放宽留层次 |

**最小示例**（加载屏/建角页/公告页通用）：

```html
<div class="ink-screen">
  <div class="ink-backdrop" aria-hidden="true">
    <div class="ink-stars" />
    <div class="ink-moon" />
    <div class="ink-range back" />
    <div class="ink-range mid" />
    <div class="ink-range front" />
    <div class="ink-mist m1" />
    <div class="ink-mist m2" />
    <div class="ink-vignette" />
  </div>
  <div class="ink-content">
    <!-- 页面内容 -->
  </div>
</div>
```

## 3.2 宣纸面

| 类 | 作用 | 说明 |
|---|---|---|
| `.paper-card` | 宣纸卡片 | 米白渐变 + `--bg-noise` + 茶渍 radial 做旧；墨字；暖光投影 |
| `.paper-card.inset` | 凹陷面 | 更白 + 内阴影（输入框类容器） |
| `.paper-card.rolls` | 上下木轴 | `::before/::after` 紫檀 + 木纹噪点（卷轴） |
| `.input.paper` | 宣纸输入框 | 控件形态（`.paper-card.inset` 等价）：更白 + 内阴影凹陷 + 左对齐 + 墨字；placeholder 用 display 字体（登录帖号/建角名号） |
| `.btn.paper` | 宣纸主 CTA | 控件形态（`.paper-card` 等价）：纸纹 + 暖光 + 墨字；场景外入口主按钮（登录叩门/建角立名·踏入），玉色"可行动"语义留给游戏内动作 |

> 登录页表单（`.auth-page .input / .btn.primary`）是控件的等价手写实现：因 `.btn/.input` 基类覆盖顺序（auth.css 晚于 atmosphere.css 加载）不便直接组合类，新界面优先直接用 `.input.paper` / `.btn.paper`。

## 3.3 古籍竖排

| 类 | 作用 | 说明 |
|---|---|---|
| `.v-cols` | 竖排列容器 | `writing-mode` 交给子列；flex row-reverse（右起读序）；顶对齐 |
| `.v-col` | 竖排列 | `writing-mode: vertical-rl` + `text-orientation: upright`；入场动画 stagger |

不支持 writing-mode 的端自动退化为横排诗句，仍可读。

# 4 动效基线

- **仅 transform/opacity**（DC-027），时长 0.3–0.55s 入场、2.6–40s 氛围循环；禁粒子/位移类特效。
- 全局 `@media (prefers-reduced-motion: reduce)` 关闭氛围动画（atmosphere.css 已内置）。
- 现有 keyframes：`moon-breathe`（月）、`mist-drift`（雾）、`lantern-glow`（灯）、`figure-bob`（人）、`scroll-rise`（卷轴入场）、`col-in`（竖排列入场）、`hint-pulse`（提示）、`overlay-fade`（浮层入场）。

# 5 组合示例：登录页与建角流程（参考实现）

登录页（`auth.css` + `LoginPage.tsx`）与建角流程（`CharacterCreateSheet.tsx`）是原语组合的完整示例：`ink-screen` + `ink-backdrop` 远景 + `prologue-scroll paper-card rolls` 卷轴 + `v-cols/v-col` 竖排 + 宣纸控件（`.input.paper` / `.btn.paper`）。

- **登录页**：ink-* 远景 + 宣纸表单（登录页表单是 `.input.paper`/`.btn.paper` 的等价手写实现，因基类覆盖顺序）；开场卷轴模式（三卷、只播一次、可略过）见 yjh-mobile-ui §4.13。
- **建角流程（V2.3）**：全屏两步——①序章引导（ink-screen + 卷轴竖排五句交待"一人一江湖"背景 + 引导句 + 立名闯荡）→ ②立名与根基（印章 + 标题 + `.input.paper` 名号 + ChoiceRow 性别 + AttributeAllocator 四维 + `.btn.paper` 踏入江湖 + 回想序章返回）。

宣纸控件原语（auth.css）：`.input.paper`（输入框：更白 + 内阴影凹陷 + 左对齐 + 墨字）、`.btn.paper`（宣纸主 CTA：纸纹 + 暖光）。

# 6 复用指南（三步）

1. **选资产**：背景 → ink-*；卡片/按钮面 → paper-card（± inset/rolls）；竖排诗句 → v-cols/v-col；动画 → 现有 keyframes。
2. **组合**：容器 `position: relative` + `ink-backdrop` 铺底 + 内容 `z-index: 2`；内容样式写进对应界面 css，勿复制原语实现。
3. **补缺**：新颜色先补 tokens.css token 再使用（铁律）；新图层/动画先提炼进 atmosphere.css 再被界面引用，保持单一事实来源。

**防回归**：界面只引用原语类名，不改原语实现；改动 atmosphere.css 后跑门禁 + 截图对比受影响界面（ui-visual-audit 走查法）。