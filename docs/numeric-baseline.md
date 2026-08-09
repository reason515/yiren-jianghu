<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》数值基线对照（D1）</strong></span><br/>
<span style="font-size: 18px;">pkuxkx 对照列 · 首版生效值 · 调整理由</span>

</div>

---

# 1. 说明

本项目数值遵循（DC-020 / DC-046）：**pkuxkx 公式仅作对照列，按移动端会话节奏重设计；系数与公式表达式集中在内容包 `mechanics.yaml`**（生效列），封测期间集中调参。本文件是 C1/D1 的"对照列归档"（来源文件 + 重设计理由）；**运行时以 yaml 为准**。

生效源：`packages/content/fixtures/pack/mechanics.yaml`（`coeffs` + `formulas` + `piecewise` + `entityIndex`）；下文括号内为当前值。

# 2. 对照表

## 2.1 成长（growth）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| exp 门槛 | 武功³/10 > 实战经验 无法深造（`feature/skill.c`、learn 检查） | `expGateExponent=3, expGateDivisor=10`（同式） | 曲线合理且与 pkuxkx 对齐，直接沿用 |
| 学习精耗 | `150/int`（learn.c）；0 级首学 ×2 | `learnJingCostBase=150` ÷ int；**0 级 ×2**（DC-039） | 沿用 pkuxkx 比例；首学加倍对齐 learn.c |
| 学费（银两） | 武馆教头：交银充学习次数（jiaotou.c，每两银约 10 次） | **按次扣银**：`learnTuitionBase=2`；NPC `teaches.tuitionSilver` 可覆盖；门派请教强制 0（DC-039） | GUI 无 give 指令；按次报价更直观；机制借鉴教头非村武师 |
| 潜能上限 | `max_potential = 100+sqrt(exp)/10`（updated.c，已废弃） | 无硬上限 + 有效潜能 = potential − learned_points | 移动端免于"刷潜能上限"挫败；已定修正（DC-017） |
| 学习潜能成本 | learn 随等级递增（learn.c 多路径） | `potentialCostPerLevel=1` × 目标等级 | 简单可预期；封测再调 |
| 请教场所 | 须 `recognize_apprentice` / 拜师 | 须同房 NPC；收费教头或本门师父（DC-039） | 废除远程万能请教；双轨分流 |
| 练习 | practice 消耗气血（practice.c） | `practiceQiBase=20 + 等级×1`；攒够 level+1 点升 1 级 | 保留"自练变强"挂机点；数值为初值 |
| 读书/领悟 | study 消耗精（study.c） | `studyJingBase=80 + 等级` | 同 practice 机制，精资源 |

## 2.2 状态（vitals）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| max_qi（成年段） | `con*16+100 + max_neili/4`（`attribute.c` 31–60 段） | `qiBase=100 + con×16 + 内功等级×2 + ⌊maxNeili/4⌋` | 沿用成人段公式；内功加成保留 |
| max_jing | `int*16+100 + max_neili/12`（attribute.c 31+ 段） | `jingBase=100 + int×16 + 内功等级×1 + ⌊maxNeili/12⌋` | 同上 |
| max_neili | `SKILL_D(force)->query_max_neili`（内功自定义） | `内功等级 × neiliPerLevel(10)` | 首版统一系数，内功自定义留作扩展 |
| max_jingli | `force_skill * jingli_times` | `jingliBase=100 + 内功等级×3` | 保留内功驱动；基础值保证新角色可用 |
| 年龄衰减 | 60 岁后气血衰减（attribute.c） | 首版无年龄阶段 | 移动端节奏（DC-020 注释）；后续引入 |
| 食物/饮水 | `max_food_capacity()` 按 con | `foodBase=200 + con×10`；水同式按 dex | 简化线性；封测调 |

## 2.3 战斗（combat）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| 有效等级 | `query_skill`：基本/2+特殊（`feature/skill.c`） | 同式；GUI 激发（DC-041） | 对齐 xkx；无人物 level 阶梯加成 |
| 命中 | `skill_power` + `random(ap+dp)<dp` 躲 / 再架（`probable.h`/`combatd.c`） | `piecewise.levelCubePower` / `combatExpBonus` + `skillPower*` 公式 | DC-041/046；旧线性命中系数已删除 |
| 躲闪/招架 | 三态 0/1/2 | 先躲后架；招架伤 ×`parryDamageFactor`(0.3) | 对齐 combatd；去掉独立「未命中」态 |
| 伤害 | 武器+action%+内功−防御 | 基底 `weaponDmgPerLevel=0.5` 等 + 招式 damage/force% + 浮动 ±10% | 招式进伤害；绝招按原级缩放 |
| 逃跑 | flee 判定 | `fleeBaseChance=0.7` | PvE 逃生友好 |

## 2.4 挂机（afk）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| 时长上限 | 无（桌面端客户端挂机） | `maxDurationHours=8` | 移动端单次上限，防绑架（DC-008） |
| 每日递减 | 无 | `dailyDiminishRate=0.5`（每满 8h 收益减半） | 防无限挂机最优解；封测调斜率 |
| 生计杂役 | 配药/钓鱼等打工 | `village_chore`：36/18/8 每时；`village_fish`：28/14/10；`village_herb`：32/16/9；耗精 10–12；`maxExp` 2k–5k | DC-042/043 新手无战斗起步 |
| 在线生计合圈 | 无（钓鱼/配药位移感） | `roundGain`：杂役 4/2/1、垂钓 3/2/1、采药 3/2/1；`jingPerRound` 1–2；合圈 ×`onlineRewardMult` | DC-045 整圈一轮；约 5–6 tick/圈 ≈ 离线时薪折算 |
| 在线短轮回 | 无 | `onlineTickSec=60` | DC-043/045 在线一步一节拍 |
| 心跳超时 | 无 | `onlineHeartbeatTimeoutSec=45` | 断线 pause，不降级离线收益 |
| 在线倍率 | 无 | `onlineRewardMult=1.8` | 在线高于离线，鼓励守着玩 |

## 2.5 PVP（pvp）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| 赛季时长 | 无异步 PVP | `seasonWeeks=6` | 4–8 周区间内取中（DC-012） |
| 积分 K 因子 | 无 | `kFactor=32` | 标准 ELO 初值 |
| 每日挑战 | 无 | `dailyChallengeLimit=5` | 防刷分（DC-011） |

## 2.6 经济（economy）

| 项目 | pkuxkx（来源） | 本项目生效值 | 调整理由 |
|---|---|---|---|
| 现金流出上限 | `moneyd.c MAX_CASHFLOW_ALLOWED`（40 两金） | `maxCashflowPerDay=1000` | 吸收"超限卖出静默失败"教训，明确拒绝（C9）；银两掉落见 NPC/任务实体 |

# 3. 调整纪律

- 封测调参/改公式只改 `mechanics.yaml`（+ 同步 schema coeffs、fixtures×2、`DEFAULT_PARAMS` 经 yaml 同源、validate.test）；控制流不进 DSL（yjh-content-pack）。
- 每次调整在 本文件"变更记录"登记（日期 + 项 + 新值 + 理由），保持可追溯。

# 4. 变更记录

| 日期 | 项 | 新值 | 理由 |
|---|---|---|---|
| 2026-08-10 | 生效源改为 `mechanics.yaml`；公式 DSL + 清理死字段 | DC-046 | review/运行时同一文件；旧 params.json 退役 |
| 2026-08-09 | 学习首学精耗 ×2；学费 `learnTuitionBase=2`；建角赠银 10 | DC-039 双轨学艺 | 对齐 xkx learn 首学加倍 + 武馆教头交银语义（按次 GUI） |
| 2026-08-09 | 生计挂机 hourlyGain + jingPerHour + maxExp | DC-042 | 新手无战斗也能攒银/历练/潜能；见 grind_jobs |
| 2026-08-09 | onlineTickSec/onlineHeartbeatTimeoutSec/onlineRewardMult | DC-043 | 在线短轮回高收益 + 心跳断线 pause |
| 2026-08-09 | grindJobs.roundGain/jingPerRound + 溪边/药坡房 | DC-045 | 在线合圈发奖；离线仍 hourlyGain |
