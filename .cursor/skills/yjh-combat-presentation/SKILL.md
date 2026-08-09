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
| 关键字渲染 | `apps/h5-client/src/components/combatRender.tsx`                        | `renderCombatSegments` → `.cm-*`                         |
| 战局 UI    | `apps/h5-client/src/components/CombatView.tsx`                          | 多敌血条、逐行显现、悬浮动作条                           |
| 样式       | `apps/h5-client/src/styles/combat.css`                                  | 紧凑行距字号；`.cm-hit/hurt/dodge/...`                   |
| 论剑回放   | `apps/h5-client/src/components/PvpReplayView.tsx`                       | 必须走同一 `battleEventLine` + segments                  |
| 数据       | NPC `nature`（content schema）；Combatant `nature`+`stats` 进会话 state | 兽鸟文案与境界估算                                       |

测试：`apps/h5-client/src/lib/combatTypes.test.ts`（关键字 mark、兽性动词、turn_start 闲笔）。

## 五条呈现原则

1. **关键字着色，非整行染色**  
   只给「命中 / 闪避 / 招架 / 咬中 / 扑上 / 绝招名」等词上色（`CombatMark` + `.cm-*`）。开场/胜负行可保留轻量整行气质（`start` / `victory`）。禁止再给整行 `.hit` / `.hurt` / `.hl`。

2. **击间要有闲笔**  
   不能只有互殴。`turn_start` 间歇注入：盯破绽、移步、绕圈、兽性低伏/低吼。密度约半数偶数回合，避免刷屏。

3. **境界必须看得出差别**  
   `combatTier(stats)`：`attack + forceLevel + weaponLevel` → low / mid / high。
   - low：蛮力、乱抡、喘气护胸
   - mid：招法、脚步、找破绽
   - high：气机、点穴脉门、招势未尽杀机先至  
     低阶文案禁止「剑气纵横」类气象词。

4. **种族决定动词系统**  
   NPC / Combatant `nature: human | beast | bird`（缺省 human；名字可 `inferNature` 兜底）。
   - human：出招 / 架势 / 内息
   - beast：扑、咬、抓、撕、低吼、呲牙（禁「使出一招」）
   - bird：扑翅、啄、锐鸣、盘旋

5. **伤势分档，数值不进文案**  
   用事件里的 `damage`（相对 `maxQi`）估 `light|mid|heavy`，换模板；**文案中不出现点数**。UI 血条负责数字。

## 节奏与排版（一屏多看）

| 项       | 现行基线   | 说明                                   |
| -------- | ---------- | -------------------------------------- |
| 战报字号 | ≈13.5px    | 可略调，勿回到「大字疏行」             |
| 行高     | ≈1.5       | 优先紧凑可读，而非杂志留白             |
| 行间距   | `gap` ≈3px | 一屏多行                               |
| 逐行显现 | ≈0.7s/行   | 显现中暂停自动普攻（`onPacingChange`） |
| 自动普攻 | 上层节拍   | 与显现互斥，避免刷屏抢读               |

改节奏时同步验收：弱敌短战仍能读完关键句；多敌局不因闲笔爆炸。

## 事件 → 叙事对照

| 事件 `type`                                 | 呈现要点                                        |
| ------------------------------------------- | ----------------------------------------------- |
| `battle_start`                              | 人/兽/鸟开场调性不同；多敌写围攻腥风或杀意      |
| `damage`                                    | 攻方 nature + tier + band；关键字 mark=hit/hurt |
| `dodge` / `miss`                            | 闪避关键字；兽扑空、爪抓空                      |
| `parry`                                     | 招架/架住关键字                                 |
| `perform`                                   | 绝招**名**单独 `mark=perform`                   |
| `turn_start`                                | 偶数回合闲笔；奇数可 null                       |
| `foe_down` / `victory` / `recover` / `flee` | 兽倒地用哀嚎/爪静；人用栽尘土                   |

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

- [ ] 着色是否只在关键字？有没有整行染色回潮？
- [ ] 有无击间闲笔？是否过密刷屏？
- [ ] 低/中/高阶读起来是否像不同水平的人？
- [ ] 狗狼鼠是否在咬/抓/扑，而不是「出招」？
- [ ] 文案有无伤害数字、冷却、BUFF 等说明书词？
- [ ] PVE 与 PVP 是否仍共用 `battleEventLine`？
- [ ] 字号行距是否仍利于一屏多读？
- [ ] 句子是否原创（未搬 xkx/金庸原句）？

## 反模式（禁止）

- 整行变绿/变红当「命中反馈」
- 只有攻击结果、没有盯视移步
- 野狗「使出一记掌法」
- 新手对打写「天地为之一静」
- PVE / PVP 两套叙事分叉
- 把伤害点数写进战报正文

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
- 机制取舍（如是否显示招式名）→ `yjh-design-docs` 决策登记
