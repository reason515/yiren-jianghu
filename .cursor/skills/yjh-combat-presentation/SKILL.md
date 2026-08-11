---
name: yjh-combat-presentation
description: 《一人江湖》(yiren-jianghu) 战斗过程呈现规范——战报文案结构、关键字着色、击间闲笔、人/兽/鸟与武功境界分流、伤势分档、战报节奏与字号行距。触发条件：改战斗战报/演出文案、CombatView 战报区、combatNarrative/combatTypes、战斗着色 CSS、NPC nature、自动普攻节拍与逐行显现；用户提到「战斗描述」「战报」「命中闪避着色」「不像武侠」「动物对手描写」「战斗行距」「学 xkx 战斗」。文案神韵遵循 yjh-wuxia-copywriting；界面骨架见 yjh-mobile-ui；规则引擎见 game-core/combat。
---

# 《一人江湖》战斗过程呈现

## 使用流程（强制）

1. **动笔前**：read 本 SKILL.md（不得凭印象改战报）；同步 read `yjh-wuxia-copywriting`（句式/红线/无数值）。
2. **改呈现时**：先定改的是「叙事池 / 着色语义 / 节奏排版 / 数据契约」哪一层，再动对应文件。
3. **写完后**：过下方检查清单；PVE 与 PVP 回放共用叙事入口，禁止只改一侧。

## 定位与边界

战斗呈现 = **服务端事件流 → 可读武侠战报 + 可读节奏的 UI**。玩家在读小说式交手，不是看 DPS 日志。

| 本 skill 管                                         | 不管（去别处）                              |
| --------------------------------------------------- | ------------------------------------------- |
| 事件→叙事行、关键字着色、闲笔、人兽鸟/境界/伤势分流 | 命中/伤害公式、回合序（`game-core/combat`） |
| 战报字号行距、逐行显现、自动攻与显现互斥            | 通用 Sheet/chip 语言（`yjh-mobile-ui`）     |
| NPC `nature` 与叙事用 stats 透传                    | 绝招内容包 `description`（内容包 + wuxia）  |

**原创红线**：可借鉴 xkx `s_combatd` 的**结构**（击间闲笔、race 分流、分级伤势），**禁止抄录原句**。登记见 `docs/sibling-borrowings.md`。

## 代码地图（改这里）

| 层         | 路径                                                                    | 职责                                                     |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 叙事核心   | `apps/h5-client/src/lib/combatNarrative.ts`                             | `narrateBattleEvent`：模板池、nature/tier/band、segments |
| 适配出口   | `apps/h5-client/src/lib/combatTypes.ts`                                 | `battleEventLine` / `toCombatState`；PVE·PVP 共用        |
| HUD 回放   | `apps/h5-client/src/lib/combatReplay.ts`                                | 按显现行反向回放气血；`exchange` 攻防停顿配套            |
| 关键字渲染 | `apps/h5-client/src/components/combatRender.tsx`                        | `renderCombatSegments` + 敌我名分色 `.cm-self/foe`       |
| 战局 UI    | `apps/h5-client/src/components/CombatView.tsx`                          | 全屏内：回放 HUD、逐行显现、行动方高亮、悬浮动作条       |
| 样式       | `apps/h5-client/src/styles/combat.css`；全屏见 `base.css` `.sheet-full` | 紧凑行距；`.cm-*`；HUD 网格                              |
| 论剑回放   | `apps/h5-client/src/components/PvpReplayView.tsx`                       | 必须走同一 `battleEventLine` + segments                  |
| 数据       | NPC `nature`（content schema）；Combatant `nature`+`stats` 进会话 state | 兽鸟文案与境界估算                                       |

测试：`apps/h5-client/src/lib/combatNarrative.test.ts`、`combatTypes.test.ts`、`combatReplay.test.ts`（闭环句、兽招架禁肘、人攻兽闪禁衣角、去重、关键字 mark、HUD 回放、exchange）。

## 呈现原则

1. **关键字着色，非整行染色**  
   只给「命中 / 闪避 / 招架 / 咬中 / 扑上 / 绝招名」等词上色（`CombatMark` + `.cm-*`）。开场/胜负行可保留轻量整行气质（`start` / `victory`）。禁止再给整行 `.hit` / `.hurt` / `.hl`。

2. **一句一招闭环（攻防自洽）**  
   每条 `damage` / `dodge` / `parry` 必须自洽：`[攻方起手动词] → [守方结果：中/闪/架]`。  
   禁止依赖「读上一行才知道谁在进攻」。不新增 `attack_windup` 服务端事件——起手嵌在结局句内。

3. **击间要有闲笔**  
   不能只有互殴。`turn_start` 间歇注入：盯破绽、移步、绕圈、兽性低伏/低吼。密度约半数偶数回合，避免刷屏。  
   闲笔起句不得与 dodge 模板撞车（禁共用「侧身半寸」等）。

4. **境界必须看得出差别**  
   `combatTier(stats)`：`attack + forceLevel + weaponLevel` → low / mid / high。
   - low：蛮力、乱抡、喘气护胸
   - mid：招法、脚步、找破绽
   - high：气机、点穴脉门、招势未尽杀机先至  
     低阶文案禁止「剑气纵横」类气象词。

5. **种族与兽种决定动词系统**  
   NPC / Combatant `nature: human | beast | bird`（缺省 human；名字可 `inferNature` 兜底）。  
   beast 内用 `inferBeastKind(name)` → `canine`（狗狼狐）/ `serpentine`（蛇蟒）/ `generic`（虎熊鼠等），**不扩 schema nature 枚举**。
   - human：出招 / 架势 / 内息
   - beast·canine：扑、咬、抓、撕、低吼、呲牙；招架用肩颈/爪/身躯（**禁肘/虎口/腕/架势/衣角**）
   - beast·serpentine：缠、咬、吐信、鳞、七寸（禁「出招/架势」）
   - bird：扑翅、啄、锐鸣、盘旋；招架用翅骨/翼/爪  
     **`parry` / `dodge` 必须同时看攻方与守方 nature**（人攻兽闪禁「衣角」；兽守禁「以肘硬接」）。

6. **伤势分档，数值不进文案**  
   用事件里的 `damage`（相对 `maxQi`）估 `light|mid|heavy`，换模板；**文案中不出现点数**。UI 血条负责数字。

7. **HUD 随显现行回放（DC-050）**  
   血条不得绑服务端整回合终态；必须按已显现战报行的 `hud` 增量回放。打中句出现时目标才掉血，敌还手句出现时己方才掉血。回合内玩家动作块与敌还手之间插入 `exchange` 停顿；当前行动方可轻量高亮。

8. **模板池与去重**  
   同 outcome × nature（× BeastKind）组合池 ≥5 条；`pickVariant` 用稳定哈希 + 会话短记忆（最近 N 条同 pool 不用同一下标）；`battle_start` 清空记忆。

## 节奏与排版（一屏多读、HUD 常驻）

| 项         | 现行基线                   | 说明                                                          |
| ---------- | -------------------------- | ------------------------------------------------------------- |
| 战报字号   | ≈13.5px                    | 可略调，勿回到「大字疏行」                                    |
| 行高       | ≈1.5                       | 优先紧凑可读                                                  |
| 行间距     | `gap` ≈3px                 |                                                               |
| 逐行显现   | ≈1.1s/行；`exchange` ≈1.6s | 显现中暂停自动普攻（`LINE_REVEAL_MS` / `EXCHANGE_REVEAL_MS`） |
| 自动普攻   | ≈4.2s/拍                   | App 层 interval；与显现互斥                                   |
| 战局面板   | 全屏 Sheet                 | `Sheet full`；战斗独占，结束后所得与离去同屏可见              |
| 血条 HUD   | 顶部紧凑常驻 + **回放**    | 绑 `replayCombatHud(visibleCount)`，禁止终态抢跑（DC-050）    |
| 敌我分色   | 「你」玉色 / 敌名朱砂      | `paintActorNames` → `.cm-self` / `.cm-foe`                    |
| 行动方高亮 | `.combat-self/foe.active`  | 随最近已显现动作行切换                                        |
| 所得配色   | 阅历/潜能/银两             | 对齐人物簿：`--stat-exp` / `--stat-potential` / `--gold`      |
| 所得时机   | 战报读完再出               | `showResult = result && revealDone`；未读完只显「余韵未散」   |
| 回合分隔   | 空行 spacer                | 下一 `turn_start` 前插入；计入逐行显现，形成回合间停顿        |
| 攻防交换   | `exchange` spacer          | 玩家动作块与敌还手之间；略长于普通行间隔（DC-050）            |

改节奏时同步验收：弱敌短战仍能读完关键句；多敌局不因闲笔爆炸。

## 事件 → 叙事对照

| 事件 `type`                                 | 呈现要点                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `battle_start`                              | 人/兽/鸟开场调性不同；多敌写围攻腥风或杀意                                                                                                |
| `dodge` / `miss`                            | 攻守双 nature；闭环起手+躲开；兽闪禁衣角；兽扑空、爪抓空；结果动词前须有守方名；可嵌 `dodgeMoveName`                                      |
| `parry`                                     | **必须看守方 nature**；兽/鸟/蛇词库；禁对兽写肘/虎口/架势；起手可嵌 `moveName` / 兵器分流                                                 |
| `perform`                                   | 绝招**名**单独 `mark=perform`                                                                                                             |
| `damage`                                    | 攻守双 nature + BeastKind + tier + band；一句含起手；有 `moveName` 嵌「一招「名」」；按 `attackSkillSlot` 剑/拳分流；关键字 mark=hit/hurt |
| `turn_start`                                | 偶数回合闲笔；奇数可 null                                                                                                                 |
| `foe_down` / `victory` / `recover` / `flee` | 兽倒地用哀嚎/爪静；人用栽尘土                                                                                                             |

第二人称：玩家侧用「你」。

## 改模板时的工作流

```text
1. 明确反馈（例如：兽不像兽 / 颜色太满 / 太疏）
2. 只动 combatNarrative 对应分支，或只动 CSS 密度
3. 补/改 combatTypes.test：segments.mark、兽性动词、闲笔非空
4. 目测 PvpReplayView 仍走同一渲染（无第二套文案）
5. 动物 NPC 缺 nature 时补 content fixtures + validate
```

新增动物对手：内容包写 `"nature": "beast"|"bird"`，描述用兽性，勿写「武功路数」。

## 检查清单

- [ ] 服务端已终局时，所得是否等战报读完才出现？
- [ ] 血条是否随显现行回放（打中句才掉对应血），有无终态抢跑？
- [ ] 玩家动作与敌还手之间是否有 exchange 停顿？行动方高亮是否可读？
- [ ] 着色是否只在关键字？有没有整行染色回潮？
- [ ] 「你」与敌名是否分色可读？
- [ ] 滚战报时顶部血条是否仍可见？战斗中是否误显精？
- [ ] 结束后所得/离去是否同屏可见（全屏布局）？
- [ ] 有无击间闲笔？是否过密刷屏？
- [ ] 低/中/高阶读起来是否像不同水平的人？
- [ ] 狗狼鼠是否在咬/抓/扑，而不是「出招」？蛇是否用缠/鳞/信？
- [ ] damage/dodge/parry 是否一句自洽（含攻方起手）？
- [ ] 兽守招架是否禁肘/虎口/架势？人攻兽闪是否禁衣角？
- [ ] 文案有无伤害数字、冷却、BUFF 等说明书词？
- [ ] PVE 与 PVP 是否仍共用 `battleEventLine`？
- [ ] 字号行距与节拍是否仍利于阅读？
- [ ] 句子是否原创（未搬 xkx/金庸原句）？
- [ ] 同场连续同类型战报是否明显复读（去重是否生效）？

## 反模式（禁止）

- 整行变绿/变红当「命中反馈」
- **终态血条抢跑**（API 一返回就把整回合净伤写上 HUD）
- 只有攻击结果、没有盯视移步
- **结局句缺攻方起手**，要靠上一行才知道谁在进攻
- 玩家与敌方动作块无间隔、像两边同时对砍
- 野狗「使出一记掌法」
- **野狗「以肘硬接」/「横开架势」**（parry 不看守方 nature）
- **人攻兽闪写「衣角」**（dodge 只看攻方 nature）
- **闪避结果主语悬空**（句末「闪避开来」无可指认守方；或人攻兽闪夹「牙关空咬」等攻方扑空词）
- **佩剑战报仍写掌拳**（须读 `attackSkillSlot` / `moveName`）
- **有 `moveName`/`dodgeMoveName` 却不进战报**（DC-053：普攻/身法具名须呈现）
- `mark: "dodge"` 染在攻方「扑上/扑啄」上（只染守方躲开/落空结果）
- 新手对打写「天地为之一静」
- PVE / PVP 两套叙事分叉
- 把伤害点数写进战报正文
- 闲笔与 dodge 共用同一起句（如「侧身半寸」）
- 池子仅 2–3 条 + 纯 `seq % n` 导致同句反复

## 与其它 skill 的协作

| 场景                     | 加载顺序                                                      |
| ------------------------ | ------------------------------------------------------------- |
| 改战报句子/模板池        | 本 skill → `yjh-wuxia-copywriting`                            |
| 改战斗 Sheet 布局/动作条 | `yjh-mobile-ui` → 本 skill（战报区）                          |
| 改命中公式/多敌规则      | `yjh-project-conventions` + game-core；呈现层随后对齐事件字段 |
| 新增野兽 NPC             | `yjh-content-pack` + 本 skill（`nature`）+ wuxia（描述）      |

## 持续改进时往哪沉淀

- 新呈现原则 / 反模式 → **更新本 SKILL**（勿只写在对话里）
- 新借鉴的外部结构 → `docs/sibling-borrowings.md`
- 战报显示招式名已定 → **DC-053**（勿再当未决）
- 其它机制取舍 → `yjh-design-docs` 决策登记
