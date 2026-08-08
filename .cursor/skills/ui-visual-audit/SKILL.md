---
name: ui-visual-audit
description: 证据驱动的界面质感走查与升级方法论。触发条件：用户说"界面太粗糙/太丑/像管理后台/没有设计感/帮我美化/优化下UI/UI升级"，或需要对现有界面做视觉审计、质感改造、逐屏打磨时。核心主张：不凭主观美化，先取证（截图+视觉模型描述+CSS 探针核实）→ 分级（P0/P1/P2）→ 出方案 → 分批实施 → 前后对比验收。与 design-spec-driven-frontend（已有规范下的忠实实现）、frontend-design（开放式创意设计）互补；本 skill 负责"既有界面太丑/粗糙"类任务的第一公里——定位真实根因。
compatibility: 需要浏览器自动化（browser-tools 套件）、截图分析（无原生视觉时用 deepseek-vision 兜底）、项目文件读写
---

# 界面质感走查与升级（ui-visual-audit）

## 定位：为什么必须先取证

"界面太粗糙"是**主观结论**，直接动手改样式大概率修不到点子上。实测案例：用户抱怨界面粗糙，视觉模型描述"白色背景 + 浅色文字"——代码审计发现根因是**主容器（`.app`/`body`）缺背景规则**导致墨色主题没渲染，白底浅字。这类 P0 根因不改，任何配色/字体打磨都白费。

因此本 skill 的纪律：**先取证、再分级、后动手**。每一步都用证据说话，不靠感觉。

## 高频 P0 根因清单（实战验证，先查这些）

文字叙事型 H5 游戏 / 古风界面"看起来粗糙"的根因高度重复，按序排查：

| #   | 根因                                                      | 症状                                                            | 验证方法                                                               |
| --- | --------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | **容器无背景**：`html/body/#root/.app/.scene` 无背景规则  | 白底浅字（浅色 token 文字在白底上不可读）；深色浮层在白底上割裂 | `getComputedStyle(document.body).backgroundColor` = `rgba(0,0,0,0)`    |
| 2   | **字体未自包**：无 `@font-face`/woff 文件，靠系统字体回退 | 书法/宋体气质全失，`body` computed font 变成系统黑体            | `document.fonts.check('16px "ZCOOL XiaoWei"')` = false；bundle 无 woff |
| 3   | **滚动条未定制**：无 `::-webkit-scrollbar` 规则           | 默认白色粗滚动条破坏沉浸                                        | `grep scrollbar` 无结果；截图可见                                      |
| 4   | **`box-sizing` 未设 border-box**                          | 容器 `height: 100vh` + padding 后总高超视口 → 莫名滚动条        | `scrollHeight > clientHeight` 且容器 computed height 正确              |
| 5   | **body 无字体基线**：全局 `font-family` 未设在 body/html  | 正文落系统默认字体，与设计字体混用                              | `getComputedStyle(document.body).fontFamily` 不含设计字体              |
| 6   | **按钮无按压态/对比不足**：`color` 与背景同阶             | 按钮像禁用态、无 affordance                                     | 视觉模型判读"像线框图/像禁用"                                          |
| 7   | **信息层级混乱**：重要数字与次级操作同字号同色            | 一眼扫不出结构                                                  | 截图人工核对字号/亮度梯度                                              |

## 走查流程（五步闭环）

### 1. 逐屏取证

- 浏览器自动化打开目标页面（本地 preview 或公网），登录 → 走查每个主界面（登录/主场景/各浮层面板）逐一截图。
- React 受控输入自动化有坑（CDP 注入不触发 onChange）：**优先 API 登录 + localStorage 注入 token** 绕过登录页，再逐屏点开面板。
- **多倍率截图**：移动端 1x（390×844）看构图，**3x（1170×2532）看细节**——小元素（剪影/点缀/小字）在 1x 下对视觉模型几乎不可见，3x 才判读准确；截图尺寸固定后逐轮对比。
- **vite dev（Windows）CSS 变换缓存静默失效（V2.8 踩坑）**：dev server 长时间运行后部分 CSS 模块会返回**空 transform**（`fetch('/src/styles/x.css')` 只有 HMR 包装、无 CSS 内容），页面样式悄悄丢失——视觉模型反复抱怨“状态栏像纯黑粗体/按钮像 Win95”，实际是 base.css 未被应用。**截图前必须 fetch 验证关键 CSS 内容**（`t.includes('.status-bar')` 等），发现为空立刻重启 dev server（`vite --port X`），勿在陈旧样式上迭代。
- **预览文件编码坑**：Windows git-bash 的 heredoc/python 脚本往 HTML 里写中文会变 GBK 乱码（元素内容损坏导致"渲染缺失"假象）——预览文件一律用 write 工具生成，不用 heredoc 传中文；headless 截图加 `--force-device-scale-factor=1` 保证布局视口=目标宽（否则 390 窗口实际渲染 512 视口，右侧被裁的假溢出）。
- 每屏截图后立即用视觉模型描述（无原生视觉时 `node deepseek-vision/vision.js <截图>`；有原生视觉直接用 read）。
- **视觉模型噪声处置**：run-to-run 结论有波动，逐轮迭代只追**多次一致的结论**；单次冒出的新建议先记录不追（实测同一页面从"底部死黑"到"落地"反复横跳，而"底部太暗"是每轮都出现的真问题）。
- **评分波动 vs 真回归：像素级 diff 客观判定**（V2.8 实测）：视觉模型打分会无因波动（同版近 98% 像素相同的两图，评分 8→6 跳变）。判断"要不要为某条反馈改代码"前，先用最小 PNG 解码脚本对比前后截图 `changedPx/changedPct`（Node zlib 解 IDAT + 反滤波，无需依赖）——改动量 <2% 且集中在目标区域，即为噪声/预期改动，不要追。
- **视觉模型配额耗尽（free tier 403）时的兜底**（V2.10 实测）：`vision.js` 返回 `AllocationQuota.FreeTierOnly` 后，验证**只靠 DOM 探针**仍可完成——`getComputedStyle`（display/grid-template-columns/fontFamily）、`getBoundingClientRect`（两行布局 top 分层）、`scrollHeight > clientHeight`（可滚动）、元素存在性探针（无大卡/无浮动指示）均客观；配合逐项核对用户反馈点验收，不依赖视觉模型也能闭环。

### 2. 探针核实（关键！视觉模型会误判）

视觉模型描述**不可全信**——曾把墨色误读成白色。用 `browser-eval.js` 跑 CSS 探针交叉验证：

```javascript
(() => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const app = document.querySelector(".app");
  const appBg = app ? getComputedStyle(app).backgroundColor : null;
  const fonts = {
    display: document.fonts.check('16px "ZCOOL XiaoWei"'),
    body: document.fonts.check('16px "Noto Serif SC"'),
  };
  return JSON.stringify({
    bodyBg: bg,
    appBg,
    bodyFont: getComputedStyle(document.body).fontFamily,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    fonts,
  });
})();
```

- `scrollHeight > clientHeight` → 溢出（查 box-sizing / 容器高度）
- `bodyBg/appBg` 透明 → P0-1 容器缺背景
- `fonts.*` false → 字体未自包或未加载完（2.6MB 字体首查可能 loading，稍等复查）
- **SVG 定位陷阱**：内联 `<svg>` 未显式 `width/height` 时默认 300×150，会撑开 `position: absolute` 元素导致"失踪/错位"——视觉模型报"元素缺失"时先探针查 `getBoundingClientRect()` 实际尺寸，再怀疑渲染（V2.1 登录页人物剪影实测踩坑）。
- **CSS 改动必须探针验证计算样式，不只验证文本**（V2.10 踩坑）：`edit` 工具多 edits 数组是 **all-or-nothing**——一个 oldText 不匹配 → 整次调用失败，前面的 edits **也不会应用**（当时以为 `.status-vitals` 已改 grid，实际还是 flex，DOM 探针 `getComputedStyle().display === "flex"` 才发现）。修改布局类 CSS 后，探针检查 `display`/`gridTemplateColumns`/`getBoundingClientRect` 的实际值，勿只看源文件 grep 通过。

### 3. 分级

- 🔴 **P0 阻塞级**：白底浅字、字体回退、滚动条、溢出——不修则其它打磨无意义，先做。
- 🟡 **P1 质感级**：按钮无按压态、对比不足、层级混乱、导航过挤、输入框边框不可见。
- 🟢 **P2 打磨级**：背景纹理/材质、逐屏图形化、动效、信息密度优化。
- 同时记录**已达标项**（防回归清单）。

### 4. 出方案（spec）

按项目设计文档规范输出 spec（若项目有 design-docs 机制则登记设计决策编号）：
`现状诊断（证据）→ 设计目标 → 借鉴来源与取舍 → 信息架构 → 视觉系统 → 逐屏升级明细 → 工程落地清单 → 分批实施 → 验收与审计`

- 借鉴来源要标注出处与**取舍**（结构/交互可借鉴，MUD 特化逻辑不复制，文案一律原创）。
- 每批工作量估算 0.5–2 天，验收点量化（`document.fonts.check`、computed style、无溢出）。

### 5. 分批实施 + 前后对比验收

- 按 P0→P1→P2 分批，每批：改代码 → 门禁全绿（test/typecheck/lint/format）→ 部署 → 公网截图对比（改前 vs 改后）。
- 验收量化：墨底完整、字体加载、无滚动条溢出、对比度、44px 热区、按压态。
- "部署后看不到效果"排查：先**强刷**（Ctrl+Shift+R / 加 query 参数绕过缓存），比对页面引用的 bundle hash 是否变化；仍旧则查 Nginx/静态目录。**根治**：Nginx 配 `location = /index.html { add_header Cache-Control "no-cache" }` + `location ~* \.(?:css|js|woff2)$ { add_header Cache-Control "public, max-age=31536000, immutable" }`——SPA 入口每次回源校验、hash 资源长缓存，部署后自动生效，无需用户手动清缓存（本项目 deploy/nginx.yiren-jianghu.conf 已落地 V2.4）。

## 输出与文档化

- 方案文档遵循项目 Markdown 格式（title block 非 H1，正文从 H1 起）。
- 设计决策走项目 ADR 登记（如 yiren-jianghu 的 DC-xxx + `pnpm test:docs-design` 校验）。
- 借鉴条目登记来源（如 pkuxkx 登记纪律：来源 → 借鉴点 → 落地 → 不借鉴什么）。

## 检查清单（每批收尾自检）

- [ ] 无白底浅字、无系统字体回退、无默认滚动条/溢出（探针证实）
- [ ] 可点元素 ≥44px 且有按压态
- [ ] 颜色全部来自 token，未新增写死色值
- [ ] 数值带语义标签，无内部类型名/命令名泄漏
- [ ] 门禁全绿 + 部署后强刷截图对比存档
- [ ] 已达标项未回归
