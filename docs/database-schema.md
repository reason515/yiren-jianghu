<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》数据库 Schema 设计</strong></span><br/>
<span style="font-size: 18px;">B1 领域模型 · 迁移即文档（services/api/migrations）</span>

</div>

---

# 1. 设计原则

- **内容定义不入库**：房间/NPC/物品/技能/绝招/任务/数值都在内容包（`packages/content`），数据库只存**运行时实例**（角色物品实例、战斗事件、排行榜快照等）。`content_versions` 记录服务端加载的内容包版本。
- **id 用 uuid**（`gen_random_uuid()`，PG16 内置，无需扩展）。
- **枚举用 text + CHECK**（不用 PG enum 类型），便于演进与回滚。
- **快照用 jsonb**：战术模板 config、PVP 双方快照、战报、排行榜条目、审计 payload。
- **大数值用 bigint**：exp/potential/learned_points/silver。⚠️ node-postgres 对 bigint 返回**字符串**，API 层需显式 `Number()` 转换（2^53 内安全）。
- **updated_at 由应用层维护**（不做触发器），应用写入时显式更新。

# 2. ER 总览

```mermaid
erDiagram
    ACCOUNT ||--o{ CHARACTER : "拥有（单 active 角色）"
    CHARACTER ||--o{ CHARACTER_SKILL : "武功"
    CHARACTER ||--o{ CHARACTER_ITEM : "行囊/装备"
    CHARACTER ||--o{ TACTIC_TEMPLATE : "战术模板"
    CHARACTER ||--o{ COMBAT_SESSION : "战斗"
    COMBAT_SESSION ||--o{ COMBAT_EVENT : "事件流"
    CHARACTER ||--o{ AFK_JOB : "挂机作业"
    TACTIC_TEMPLATE o|--o{ AFK_JOB : "快照绑定"
    CHARACTER ||--o{ PVP_MATCH : "挑战方/防守方"
    PVP_SEASON ||--o{ PVP_MATCH : "赛季"
    PVP_SEASON ||--o{ PVP_SCORE : "积分"
    PVP_SEASON ||--o{ LEADERBOARD_SNAPSHOT : "赛季榜"
    CHARACTER ||--o{ FORUM_POST : "发帖"
    FORUM_SECTION ||--o{ FORUM_POST : "板块"
    FORUM_POST ||--o{ FORUM_COMMENT : "评论"
    FORUM_POST ||--o{ FORUM_LIKE : "点赞"
    CHARACTER ||--o{ FORUM_REPORT : "举报"
    AUDIT_EVENT : "审计事件"
    CONTENT_VERSION : "内容包版本"
```

# 3. 表结构

## 3.1 accounts（账号）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | 平台无关 accountId（微信绑定后同一账号） |
| status | text | CHECK active/frozen | frozen 为风控冻结 |
| created_at / updated_at | timestamptz | NOT NULL | |

## 3.2 characters（角色）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| account_id | uuid | FK→accounts，NOT NULL | |
| name | text | NOT NULL，全局 UNIQUE | 可改名（受限） |
| gender | text | CHECK male/female | |
| status | text | CHECK active/discarded/frozen | 见 §4 状态机 |
| attrs | jsonb | NOT NULL | `{ str, int, con, dex: { cur, base } }` |
| exp / potential / learned_points / silver | bigint | NOT NULL | 有效潜能 = potential − learned_points；建角默认赠银 10（DC-039） |
| qi/jing/jingli/neili/food/water/eff_qi/eff_jing | integer | NOT NULL | 当前值持久化（上限由 C2 动态计算） |
| last_heal_at | timestamptz | NULL，DEFAULT now() | 上次生存结算时刻（DC-032/044；场景/读档按时间差恢复气精并消耗食水） |
| room_path / safe_room_id | text | NOT NULL | 当前位置与安全点（内容包房间 id） |
| master_npc_id | text | NULL | 当前师父 NPC id（DC-039/040）；收费请教不写；请教须匹配此人 |
| sect_id | text | NULL | 门派 id（如 `xuanmen`）；与师父同落库 |
| generation | integer | NULL | 门派辈分（DC-040）；越小越尊；拜师后 = 师父 generation + 1 |
| skill_enable | jsonb | NULL | 激发图（DC-041）：`{ [slot]: skillId \| null }`；槎位缺省按 `autoEnableMap` 补齐，显式 `null` 表示强制回退基本功 |
| current_content_version | text | NOT NULL | 该角色加载的内容包版本 |
| discarded_at | timestamptz | NULL | 放弃时间（30 天冻结计时） |

**索引**：`uq_characters_account_active`（部分唯一：`account_id WHERE status='active'`）——单角色约束；`name` 唯一。

## 3.3 character_skills（角色武功）

| 列 | 类型 | 约束 |
|---|---|---|
| character_id | uuid | FK→characters CASCADE |
| skill_id | text | 内容包技能 id |
| level | integer | CHECK ≥ 0 |
| practice_points | integer | NOT NULL DEFAULT 0，演练/参悟积累的进度点 |

PK `(character_id, skill_id)`。

### 3.3.1 character_moves / character_performs（已解锁招式 / 已学绝招，DC-041）

| 表 | 列 | 说明 |
|---|---|---|
| character_moves | character_id, move_id, learned_at | 特殊功达 `move.minLevel` 时自动写入（`learn`/`practice`/`study` 升级后统一走 `unlockMoves`）；普攻 `pickMove` 只从已解锁 + 已激发的招式中抽取 |
| character_performs | character_id, perform_id, learned_at | 须同房师父/教头当面传授（`POST /skills/learn-perform`），校验 `learnMinLevel` + `learnRequires`；战斗中 `resolvePlayerAction` 只认此表已学绝招 |

两表 PK 均为 `(character_id, *_id)`，FK→characters CASCADE。

## 3.4 character_items（物品实例）

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 实例 id |
| character_id | uuid FK CASCADE | |
| item_def_id | text | 内容包物品 id |
| quantity | integer CHECK > 0 | 可堆叠数量 |
| slot | text NULL | weapon/armor/…；NULL = 行囊 |

### 3.4.1 character_room_items（角色已拾取的场景物品）

PK `(character_id, room_id, item_def_id)`，另记 `taken_at`。房间内容包中的静态物品按角色独立可见；同一角色拾取成功后不再出现在该房间，防止重复领取（DC-025）。

### 3.4.2 shop_cashflows（商贩每日回收额）

PK `(vendor_id, day)`，`sell_received bigint CHECK >= 0`。向商贩卖出物品时在同一事务内累加；超过内容包 `economy.maxCashflowPerDay` 即拒绝，避免回收出金失控（DC-025）。

## 3.5 tactic_templates（战术模板）

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| character_id | uuid FK CASCADE | |
| name | text | 可命名多份 |
| config | jsonb | 条件→动作→冷却→优先级（C6 Schema） |
| is_default_pvp | boolean | PVP 默认防守模板 |

使用处（afk_jobs/pvp_matches）**固化快照**，编辑模板不影响已开始的挂机/对战。

## 3.6 combat_sessions / combat_events（战斗与战报事件流）

combat_sessions：id、character_id、kind（pve/pvp）、status（ongoing/finished/abandoned）、target_def_id（主目标 NPC，数组首项）、seed（确定性随机）、`state`（PVE 可重演：`combatants` 含玩家 `a` 与敌方 `b0`…、`foeIds`、回合、随机调用计数、绝招冷却表；同场最多 5 敌，DC-038）、result（win/lose/escape）、started_at、finished_at。

combat_events：id、session_id（FK CASCADE）、seq、type、payload jsonb、created_at；索引 `(session_id, seq)`。战报 = 该会话事件流的有序回放。手动 PVE 每次仅由客户端提交角色意图（可含自动普攻节拍，DC-037），服务端续算玩家动作后全部存活敌方回合并持久化；胜利时按本场击败的各 NPC `battleRewards`/`drops` 累加结算，并写入 `reward` / `quest_progress` 事件（DC-023、DC-024、DC-038）。

## 3.7 afk_jobs（挂机作业）

| 列 | 类型 | 说明 |
|---|---|---|
| id / character_id | uuid | FK CASCADE |
| kind | text | quest/practice/dazuo/tuna/grind（study 仅兼容旧作业；fishing/peiyao 预留，首版用 grind 统一生计） |
| presence | text | online/offline（DC-043；缺省 offline） |
| status | text | running/paused/completed/failed/cancelled |
| phase | text | 状态机相位（init/hunt/fight/rest…） |
| template_id / template_snapshot | uuid / jsonb | 绑定的战术模板（含快照） |
| config | jsonb | 任务目标、累计 `gains`、在线 `journal[]`；在线生计另含 `phase`/`routeIndex`/`pendingWork`/`rounds`（DC-045，无新列） |
| day / hours_today | text / numeric | 每日递减计时（YYYY-MM-DD） |
| scheduled_end_at | timestamptz | 时长上限（Worker 到期结算） |
| last_tick_at | timestamptz | 上次结算游标 |
| last_heartbeat_at | timestamptz | 在线心跳（DC-043；超时 pause） |
| journal_seq | int | 已推送见闻游标（DC-043） |
| report / stop_reason | jsonb / text | 战报与停止原因 |
| read_at | timestamptz | NULL，重连恢复点未读标记（resume 返回后置已读） |

索引 `(status, scheduled_end_at)`：Worker 崩溃恢复扫描运行中且到期作业。

## 3.8 PVP（seasons / matches / scores / leaderboard_snapshots）

- pvp_seasons：name、starts_at、ends_at、status（upcoming/active/ended）
- pvp_matches：season_id、challenger/defender_id、双方 snapshot jsonb、seed、result（challenger_win/defender_win/draw/invalid）、score_delta、report jsonb、read_at（NULL，重连恢复点未读标记）
- pvp_scores：PK (character_id, season_id)、score
- leaderboard_snapshots：kind（growth/season_pvp）、season_id、generated_at、entries jsonb——长期榜与赛季榜都按快照落库，供历史查询

## 3.9 论坛（sections / posts / comments / likes / reports）

- forum_posts/comments：status（visible/hidden/deleted）；作者 FK→characters
- forum_likes：PK (post_id, character_id)（防重复点赞）
- forum_reports：target_type（post/comment）、status（open/resolved/dismissed）、handled_by——管理审核队列

## 3.10 audit_events / content_versions

- audit_events：account_id/character_id（可空）、action、payload jsonb——关键操作可追溯（创建/放弃角色、模板保存、挂机起停、PVP 结算、举报处理、货币变动）
- content_versions：version（UNIQUE）、name、status（active/rolled_back）、loaded_at

## 3.11 character_quests（角色任务进度）

| 列 | 类型 | 约束 |
|---|---|---|
| character_id | uuid | FK→characters CASCADE |
| quest_id | text | 内容包任务 id |
| status | text | CHECK accepted/completed/reported |
| progress | jsonb | NOT NULL `{ phase, counts }`：当前相位与各目标累计 |
| accepted_at | timestamptz | NOT NULL DEFAULT now() |
| completed_at / reported_at | timestamptz | NULL |

PK `(character_id, quest_id)`。状态流转：`accepted` →（相位全满）`completed` →（交差）`reported`；可重复任务 `reported` 后可重接（进度重置回 `accepted`）。任务定义在内容包 `quests/`，本表只存角色侧进度。

# 4. 关键状态机

## 4.1 角色状态（characters.status）

```text
active ──放弃（二次确认）──▶ discarded ──30 天冻结期──▶ 物理清理/匿名归档
  │
  └──风控──▶ frozen（不可登录/参与，待人工处理）
```

- 放弃后**立即**可创建新角色（`uq_characters_account_active` 只约束 active）。
- discarded 角色：不可恢复、不可转移资产、退出排行榜/PVP/论坛身份。
- 冻结期仅供风控与客服追溯；30 天后清理或匿名归档（风控模块落地）。

## 4.2 挂机作业（afk_jobs.status）

```text
running ──到期/资源耗尽/失败──▶ completed | failed（写 report + stop_reason）
running ──玩家中断/维护──▶ paused ──恢复──▶ running
running ──手动停止──▶ cancelled
```

- Worker 崩溃恢复：扫描 `(status='running', scheduled_end_at <= now())` 的过期作业，按幂等规则结算或标记异常。
- 每日递减：`day` 变化时重置 `hours_today`，收益按 `diminishMultiplier`（game-core C1）衰减。

## 4.3 PVP 赛季（pvp_seasons.status）

```text
upcoming ──开赛──▶ active ──结束──▶ ended（结算赛季积分与奖励，赛季榜重置）
```

# 5. 迁移与验证

- 迁移文件：`services/api/migrations/`（CJS，显式 up/down；禁止独立 .down.sql）。
- 新增表请**顺延时间戳命名**（如 `20260807000001_xxx.cjs`）。
- 验证：CI `migrations` 作业对 postgres 服务容器执行 `up` 后 `down`；E2E 冒烟在 up 后做 DB 往返。
- 修改既有迁移文件 = 破坏已部署环境的迁移链；**新增迁移而非改旧迁移**（B1 前无线上环境，仍建议遵守）。
