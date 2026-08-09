import { z } from "zod";

/**
 * 内容包 Schema v0.1（A6 基础版，随 B1/D 阶段演进）。
 * 覆盖：manifest / 数值参数 / 房间 / NPC / 物品 / 技能 / 绝招 / 任务 / 主线节点。
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "id 只能用小写字母、数字、_ 与 -");

// ---------- 数值参数表（D1 填充，封测集中调参） ----------
export const paramsSchema = z.object({
  /** 经验曲线：下一级所需经验 = base * growth^(level-1)（首版简化） */
  expCurve: z.object({ base: z.number().int().positive(), growth: z.number().positive() }),
  /** 潜能：学习消耗系数（有效潜能 = potential - learned_points） */
  potential: z.object({ learnCostFactor: z.number().positive() }),
  /** 战斗基础值（命中/躲闪/招架）与伤害系数 */
  combat: z.object({
    baseHitRate: z.number().min(0).max(1),
    baseDodgeRate: z.number().min(0).max(1),
    baseParryRate: z.number().min(0).max(1),
    hitPerAttackDiff: z.number().default(0.01),
    dodgePerDodgeDiff: z.number().default(0.01),
    parryPerParryDiff: z.number().default(0.01),
    weaponDmgPerLevel: z.number().default(0.5),
    forceDmgPerLevel: z.number().default(0.4),
    defenseReduce: z.number().default(0.5),
    damageVariance: z.number().min(0).max(0.5).default(0.1),
    recoverNeiliPerTurn: z.number().nonnegative().default(20),
    fleeBaseChance: z.number().min(0).max(1).default(0.7),
  }),
  /** 挂机：时长上限与每日递减 */
  afk: z.object({
    maxDurationHours: z.number().min(0.5).max(24),
    dailyDiminishRate: z.number().min(0).max(1),
    /** 修炼挂机每小时的参悟/演练次数（F2 worker 结算频率）。 */
    studyAttemptsPerHour: z.number().int().min(1).max(60).default(12),
  }),
  /** 自然恢复（V2.12，参照 pkuxkx heart_beat 时间恢复）：
   * 每分钟按上限比例恢复（qiPerMin=0.02 → maxQi 的 2%/min）；
   * 场景交互时按距上次结算的时间差恢复，单次封顶 maxWindowMinutes 防离线累积。 */
  regen: z
    .object({
      qiPerMin: z.number().min(0).max(1).default(0.02),
      jingPerMin: z.number().min(0).max(1).default(0.015),
      jingliPerMin: z.number().min(0).max(1).default(0.02),
      neiliPerMin: z.number().min(0).max(1).default(0.01),
      maxWindowMinutes: z.number().int().min(1).max(1440).default(30),
    })
    .default({}),
  /** 状态（Vitals）公式系数：C2 动态上限（首版无年龄阶段，采用成年人常数，参照 pkuxkx 31–60 段公式） */
  vitals: z.object({
    qiBase: z.number().int().nonnegative().default(100),
    jingBase: z.number().int().nonnegative().default(100),
    jingliBase: z.number().int().nonnegative().default(100),
    qiPerCon: z.number().int().nonnegative().default(16),
    qiPerStr: z.number().int().nonnegative().default(0),
    jingPerInt: z.number().int().nonnegative().default(16),
    forceQiPerLevel: z.number().int().nonnegative().default(2),
    forceJingPerLevel: z.number().int().nonnegative().default(1),
    neiliPerLevel: z.number().int().positive().default(10),
    jingliPerLevel: z.number().int().nonnegative().default(3),
    neiliToQiDiv: z.number().int().positive().default(4),
    neiliToJingDiv: z.number().int().positive().default(12),
    foodBase: z.number().int().positive().default(200),
    foodPerCon: z.number().int().nonnegative().default(10),
    waterBase: z.number().int().positive().default(200),
    waterPerDex: z.number().int().nonnegative().default(10),
  }),
  /** 成长（学习/练习/读书）：exp 门槛与资源消耗 */
  growth: z.object({
    learnJingCostBase: z.number().int().positive().default(150),
    /** 收费请教默认学费（两银/次）；NPC teaches.tuitionSilver 可覆盖；门派请教强制 0（DC-039）。 */
    learnTuitionBase: z.number().int().nonnegative().default(2),
    potentialCostPerLevel: z.number().positive().default(1),
    expGateExponent: z.number().positive().default(3),
    expGateDivisor: z.number().positive().default(10),
    practiceQiBase: z.number().int().positive().default(20),
    practiceQiPerLevel: z.number().int().nonnegative().default(1),
    practicePointsPerAction: z.number().positive().default(1),
    studyJingBase: z.number().int().positive().default(80),
  }),
  /** PVP：赛季与积分规则 */
  pvp: z.object({
    dailyChallengeLimit: z.number().int().positive().default(5),
    kFactor: z.number().int().positive().default(32),
    seasonWeeks: z.number().int().positive().default(6),
  }),
  /** 经济：掉落基础与现金流出上限（防通胀） */
  economy: z.object({
    silverDropBase: z.number().nonnegative(),
    maxCashflowPerDay: z.number().positive(),
  }),
});

// ---------- 房间 ----------
const exitSchema = z.object({
  dir: z.string().min(1),
  roomId: id,
  name: z.string().optional(),
  hidden: z.boolean().optional(),
});

const doorSchema = z.object({
  dir: z.string().min(1),
  name: z.string().default("门"),
  locked: z.boolean().optional(),
});

const actionSchema = z.object({
  command: z.string().min(1),
  label: z.string().min(1),
});

export const roomSchema = z.object({
  id,
  area: z.string().min(1),
  name: z.string().min(1),
  shortDesc: z.string().default(""),
  longDesc: z.string().default(""),
  /** 地图布局语义网格坐标（八向约束，见 yjh-map-design）；D/E 阶段用于区域地图渲染。 */
  grid: z.tuple([z.number(), z.number()]).optional(),
  exits: z.array(exitSchema).default([]),
  doors: z.array(doorSchema).default([]),
  actions: z.array(actionSchema).default([]),
  canSleep: z.boolean().optional(),
  npcIds: z.array(id).default([]),
  itemIds: z.array(id).default([]),
});

// ---------- NPC ----------
const skillRefSchema = z.object({ skillId: id, level: z.number().int().nonnegative() });
const dropSchema = z.object({
  itemId: id,
  chance: z.number().min(0).max(1),
  min: z.number().int().nonnegative().default(1),
  max: z.number().int().nonnegative().default(1),
  minExp: z.number().int().nonnegative().optional(),
});

/** 战胜 battle NPC 后由服务端一次性结算的成长与银两；物品另见 drops。 */
const battleRewardSchema = z.object({
  exp: z.number().int().nonnegative().default(0),
  potential: z.number().int().nonnegative().default(0),
  silver: z.number().int().nonnegative().default(0),
});

/** NPC 可教武功条目（DC-039）：与战斗 skills 展示等级分离。 */
export const teachOfferSchema = z.object({
  skillId: id,
  /** 可教至该等级（含）；实际上限再与 skill.maxLevel、师父该技能等级取 min。 */
  maxLevel: z.number().int().positive(),
  /** 覆盖全局 learnTuitionBase；门派请教由服务端强制 0。 */
  tuitionSilver: z.number().int().nonnegative().optional(),
});

export const npcSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(["battle", "vendor", "tuition_teacher", "apprentice_master", "quest_giver", "npc"]),
  /** 外观描述（V2.12 观察动作）：玩家「观察」时显示，短句画面感（wuxia 规范）。 */
  description: z.string().default(""),
  level: z.number().int().nonnegative().optional(),
  attrs: z
    .object({ str: z.number(), int: z.number(), con: z.number(), dex: z.number() })
    .optional(),
  skills: z.array(skillRefSchema).default([]),
  equipment: z.array(id).default([]),
  drops: z.array(dropSchema).default([]),
  /** battle NPC 胜负结算奖励；数值随内容包版本调整。 */
  battleRewards: battleRewardSchema.default({ exp: 0, potential: 0, silver: 0 }),
  /**
   * 同场盟友（DC-038）：开战时若盟友亦在当前房间且为 battle，则一并入场（去重、计入上限）。
   */
  battleAllies: z.array(id).default([]),
  /**
   * 战斗叙事种族（借鉴 xkx race 分流，文案原创）：兽/鸟用扑咬抓啄，不用「出招」口吻。
   */
  nature: z.enum(["human", "beast", "bird"]).default("human"),
  /** 商店库存（kind=vendor 时生效）：物品 + 买卖价。 */
  goods: z
    .array(
      z.object({
        itemId: id,
        buy: z.number().int().nonnegative().default(0),
        sell: z.number().int().nonnegative().default(0),
      }),
    )
    .default([]),
  /**
   * 可教武功清单（DC-039）：tuition_teacher 必填；apprentice_master 若传功则填。
   * 与 skills（战斗/观察展示等级）分离。
   */
  teaches: z.array(teachOfferSchema).default([]),
  /** 门派 id（apprentice_master 传功/收徒时必填，如 xuanmen）。 */
  sectId: id.optional(),
  aggressive: z.boolean().default(false),
  respawnSec: z.number().int().positive().optional(),
  dialogue: z.array(z.string()).default([]),
});

// ---------- 物品 ----------
const itemStatsSchema = z.object({
  attack: z.number().optional(),
  defense: z.number().optional(),
  dodge: z.number().optional(),
  parry: z.number().optional(),
  maxQi: z.number().optional(),
  maxJing: z.number().optional(),
  maxNeili: z.number().optional(),
});

export const itemSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(["weapon", "armor", "drug", "food", "misc"]),
  stats: itemStatsSchema.optional(),
  value: z.number().int().nonnegative().default(0),
  weight: z.number().nonnegative().default(1),
  stackable: z.boolean().default(false),
  description: z.string().default(""),
  usable: z
    .object({
      effect: z.enum(["heal_qi", "heal_jing", "restore_neili", "feed", "quench"]),
      amount: z.number().positive(),
    })
    .optional(),
});

// ---------- 技能 ----------
export const skillSchema = z.object({
  id,
  name: z.string().min(1),
  category: z.enum(["force", "weapon", "dodge", "parry", "knowledge"]),
  description: z.string().default(""),
  maxLevel: z.number().int().positive().default(500),
  baseLevel: z.number().int().nonnegative().default(0),
});

// ---------- 绝招 ----------
const performConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("self_qi_below_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("self_neili_above_pct"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("skill_level_at_least"), value: z.number().int().nonnegative() }),
  z.object({ type: z.literal("enemy_qi_below_pct"), value: z.number().min(0).max(100) }),
]);

export const performSchema = z.object({
  id,
  skillId: id,
  name: z.string().min(1),
  cost: z.object({
    qi: z.number().int().nonnegative().default(0),
    jing: z.number().int().nonnegative().default(0),
    neili: z.number().int().nonnegative().default(0),
  }),
  /** 冷却（回合制引擎按“回合”解释：1 回合 = 1 次行动）。 */
  cooldownTurns: z.number().positive(),
  conditions: z.array(performConditionSchema).default([]),
  effect: z.object({
    type: z.enum(["damage", "heal", "buff"]),
    amount: z.number().positive(),
    target: z.enum(["enemy", "self"]).default("enemy"),
  }),
  description: z.string().default(""),
});

// ---------- 任务 ----------
const questPhaseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goto"), targetId: id }),
  z.object({
    type: z.literal("kill"),
    targetId: id,
    count: z.number().int().positive().default(1),
  }),
  z.object({ type: z.literal("talk"), targetId: id }),
  z.object({
    type: z.literal("deliver"),
    targetId: id,
    count: z.number().int().positive().default(1),
  }),
  z.object({
    type: z.literal("collect"),
    targetId: id,
    count: z.number().int().positive().default(1),
  }),
]);

export const questSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(["sect", "bounty", "main"]),
  minExp: z.number().int().nonnegative().default(0),
  /** 任务简报（玩家可见文案，武侠风规范见 yjh-wuxia-copywriting）。 */
  briefing: z.string().default(""),
  phases: z.array(questPhaseSchema).min(1),
  rewards: z.object({
    exp: z.number().int().nonnegative().default(0),
    potential: z.number().int().nonnegative().default(0),
    silver: z.number().int().nonnegative().default(0),
    items: z.array(z.object({ itemId: id, count: z.number().int().positive() })).default([]),
  }),
  repeatable: z.boolean().default(false),
});

// ---------- 主线节点 ----------
export const storySchema = z.object({
  id,
  title: z.string().min(1),
  questId: id.optional(),
  text: z.string().default(""),
  next: z.array(id).default([]),
  conditions: z.array(z.string()).default([]),
});

// ---------- manifest ----------
export const manifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  description: z.string().default(""),
});

// ---------- 天下图（map-design §5：区域节点 + 道路链，非房间网格） ----------
export const worldMapNodeSchema = z.object({
  /** 对应 rooms[].area */
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["village", "metropolis", "sect", "pass", "landmark"]),
  /** 相对地理坐标，北在上 */
  geo: z.tuple([z.number(), z.number()]),
  scale: z.enum(["village", "capital", "pass", "landmark"]).default("village"),
});

export const worldMapRoadSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  mode: z.enum(["road", "path"]).default("road"),
});

export const worldMapSchema = z.object({
  nodes: z.array(worldMapNodeSchema).min(1),
  roads: z.array(worldMapRoadSchema).default([]),
});

// ---------- 内容包整体 ----------
export const contentPackSchema = z.object({
  manifest: manifestSchema,
  params: paramsSchema,
  rooms: z.array(roomSchema).default([]),
  npcs: z.array(npcSchema).default([]),
  items: z.array(itemSchema).default([]),
  skills: z.array(skillSchema).default([]),
  performs: z.array(performSchema).default([]),
  quests: z.array(questSchema).default([]),
  story: z.array(storySchema).default([]),
  /** 天下图（可选；缺省时服务端仅返回本域房间图） */
  worldMap: worldMapSchema.optional(),
});

export type ContentPack = z.infer<typeof contentPackSchema>;
export type Params = z.infer<typeof paramsSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Npc = z.infer<typeof npcSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Perform = z.infer<typeof performSchema>;
export type Quest = z.infer<typeof questSchema>;
export type StoryNode = z.infer<typeof storySchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type WorldMap = z.infer<typeof worldMapSchema>;
export type WorldMapNode = z.infer<typeof worldMapNodeSchema>;
export type WorldMapRoad = z.infer<typeof worldMapRoadSchema>;
