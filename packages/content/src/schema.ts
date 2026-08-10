import { z } from "zod";

/**
 * 内容包 Schema v0.1（A6 基础版，随 B1/D 阶段演进）。
 * 覆盖：manifest / 数值参数 / 房间 / NPC / 物品 / 技能 / 绝招 / 任务 / 主线节点。
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "id 只能用小写字母、数字、_ 与 -");

// ---------- 数值系数表（DC-046：mechanics.yaml coeffs；公式见 formulas/piecewise） ----------
export const paramsSchema = z.object({
  /** 经验曲线系数（公式 expForNextLevel） */
  expCurve: z.object({ base: z.number().int().positive(), growth: z.number().positive() }),
  /** 战斗伤害与行动系数（命中改 skill_power，见 formulas/piecewise） */
  combat: z.object({
    weaponDmgPerLevel: z.number().default(0.5),
    forceDmgPerLevel: z.number().default(0.4),
    defenseReduce: z.number().default(0.5),
    damageVariance: z.number().min(0).max(0.5).default(0.1),
    recoverNeiliPerTurn: z.number().nonnegative().default(20),
    fleeBaseChance: z.number().min(0).max(1).default(0.7),
    /** 招架后伤害倍率（原硬编码 0.3） */
    parryDamageFactor: z.number().min(0).max(1).default(0.3),
    /** 内力低于上限比例时选择回气 */
    recoverNeiliThreshold: z.number().min(0).max(1).default(0.3),
    defenseBase: z.number().nonnegative().default(10),
    dodgeBase: z.number().nonnegative().default(5),
    parryBase: z.number().nonnegative().default(5),
    /** 加力每档额外伤害（DC-048）。 */
    jialiDmgPerLevel: z.number().nonnegative().default(4),
    /** 加力每档耗内（DC-048）。 */
    jialiNeiliPerLevel: z.number().nonnegative().default(5),
    /** 伤害转为伤势（压 effQi）的比例。 */
    woundFactor: z.number().min(0).max(1).default(0.35),
    /** 绝招后忙乱回合数（DC-049）。 */
    performBusyTurns: z.number().int().nonnegative().default(1),
    /** 演示毒：伤害绝招附带回合数（0=关闭）。 */
    demoPoisonTurns: z.number().int().nonnegative().default(0),
    demoPoisonDmg: z.number().nonnegative().default(3),
  }),
  /** 挂机：时长上限与每日递减 */
  afk: z.object({
    maxDurationHours: z.number().min(0.5).max(24),
    dailyDiminishRate: z.number().min(0).max(1),
    /** 修炼挂机每小时的参悟/演练次数（F2 worker 结算频率）。 */
    studyAttemptsPerHour: z.number().int().min(1).max(60).default(12),
    /** 在线挂机短轮回秒数（DC-043）。 */
    onlineTickSec: z.number().int().min(15).max(600).default(60),
    /** 在线心跳超时秒数；超时 pause（断线）。 */
    onlineHeartbeatTimeoutSec: z.number().int().min(20).max(300).default(45),
    /** 在线相对离线收益倍率。 */
    onlineRewardMult: z.number().min(1).max(5).default(1.8),
  }),
  /** 自然恢复/消耗（V2.12 + DC-044，参照 pkuxkx heart_beat）：
   * qi/jing/jingli/neili 每分钟按上限比例恢复；food/water 按绝对值消耗；
   * 场景/角色/会话入口按距上次结算的时间差结算，单次封顶 maxWindowMinutes 防离线累积。 */
  regen: z
    .object({
      qiPerMin: z.number().min(0).max(1).default(0.02),
      jingPerMin: z.number().min(0).max(1).default(0.015),
      jingliPerMin: z.number().min(0).max(1).default(0.02),
      neiliPerMin: z.number().min(0).max(1).default(0.01),
      /** 饱腹每分钟消耗点数（绝对值，非比例）。 */
      foodPerMin: z.number().min(0).default(1),
      /** 饮水每分钟消耗点数（绝对值，非比例）。 */
      waterPerMin: z.number().min(0).default(1.5),
      maxWindowMinutes: z.number().int().min(1).max(1440).default(30),
    })
    .default({}),
  /** 状态（Vitals）公式系数：C2 动态上限（首版无年龄阶段，采用成年人常数，参照 pkuxkx 31–60 段公式） */
  vitals: z.object({
    qiBase: z.number().int().nonnegative().default(50),
    jingBase: z.number().int().nonnegative().default(50),
    jingliBase: z.number().int().nonnegative().default(50),
    qiPerCon: z.number().int().nonnegative().default(8),
    qiPerStr: z.number().int().nonnegative().default(0),
    jingPerInt: z.number().int().nonnegative().default(8),
    forceQiPerLevel: z.number().int().nonnegative().default(1),
    forceJingPerLevel: z.number().int().nonnegative().default(1),
    neiliPerLevel: z.number().int().positive().default(8),
    jingliPerLevel: z.number().int().nonnegative().default(2),
    neiliToQiDiv: z.number().int().positive().default(4),
    neiliToJingDiv: z.number().int().positive().default(12),
    foodBase: z.number().int().positive().default(100),
    foodPerCon: z.number().int().nonnegative().default(5),
    waterBase: z.number().int().positive().default(100),
    waterPerDex: z.number().int().nonnegative().default(5),
  }),
  /** 成长（学习/练习/读书）：exp 门槛与资源消耗 */
  growth: z.object({
    learnJingCostBase: z.number().int().positive().default(150),
    /** 收费请教默认学费（两银/次）；NPC teaches.tuitionSilver 可覆盖；门派请教强制 0（DC-039）。 */
    learnTuitionBase: z.number().int().nonnegative().default(2),
    potentialCostPerLevel: z.number().positive().default(1),
    /** 历练门槛指数（小数值：2 → level²×…） */
    expGateExponent: z.number().positive().default(2),
    /** 历练门槛除数（小数值：0.5 → level²×2） */
    expGateDivisor: z.number().positive().default(0.5),
    practiceQiBase: z.number().int().positive().default(12),
    practiceQiPerLevel: z.number().int().nonnegative().default(1),
    practicePointsPerAction: z.number().positive().default(1),
    studyJingBase: z.number().int().positive().default(40),
    /** 0 级首学精耗倍率（原硬编码 ×2） */
    firstLearnJingMult: z.number().positive().default(2),
    /** practicePointsNeeded = level + offset */
    practicePointsNeededOffset: z.number().int().nonnegative().default(1),
  }),
  /** PVP：赛季与积分规则 */
  pvp: z.object({
    dailyChallengeLimit: z.number().int().positive().default(5),
    kFactor: z.number().int().positive().default(32),
    seasonWeeks: z.number().int().positive().default(6),
    /** ELO 期望分母（原硬编码 400） */
    eloScale: z.number().positive().default(400),
  }),
  /** 经济：现金流出上限（防通胀） */
  economy: z.object({
    maxCashflowPerDay: z.number().positive(),
  }),
  /** 激发有效等级系数 */
  enable: z.object({
    basicLevelDivisor: z.number().positive().default(2),
  }),
  /** 绝招按原级放大 */
  perform: z.object({
    scaleDivisor: z.number().positive().default(100),
  }),
  /** skill_power 合成系数（小数值：输出约等于有效等级） */
  skillPower: z.object({
    attrDivisor: z.number().positive().default(6),
    strWeight: z.number().positive().default(5),
    zeroLevelExpDiv: z.number().positive().default(50),
    minPower: z.number().positive().default(1),
    /** 分母放大：weighted/(attrDivisor*levelScale) 使同属性下战力≈level */
    levelScale: z.number().positive().default(20),
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

/**
 * 收徒规则（DC-040，对齐 xkx recruit）：
 * - acceptOutsiders：门外可拜（入门点，如大师兄）
 * - minSkills：同门改拜更高辈分师父时的武功门槛
 * 辈分数字越小越尊（掌门 < 大师兄）；弟子 generation = 师父 generation + 1。
 */
export const recruitSchema = z.object({
  acceptOutsiders: z.boolean().default(false),
  minSkills: z.array(z.object({ skillId: id, level: z.number().int().positive() })).default([]),
});

/** 基本技能槽（可 enable）；knowledge 仅展示/门槛，不可激发（DC-041）。 */
export const enableSlotSchema = z.enum(["force", "dodge", "parry", "unarmed", "sword", "blade"]);
export const skillCategorySchema = z.enum([
  "force",
  "dodge",
  "parry",
  "unarmed",
  "sword",
  "blade",
  "knowledge",
]);

export const npcSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(["battle", "vendor", "tuition_teacher", "apprentice_master", "quest_giver", "npc"]),
  /** 外观描述（V2.12 观察动作）：玩家「观察」时显示，短句画面感（wuxia 规范）。 */
  description: z.string().default(""),
  level: z.number().int().nonnegative().optional(),
  /**
   * 开战历练门槛（阶梯怪谱）：玩家历练 < minExp 则拒战。
   * 新手怪 0；中期怪抬高，避免长期刷野狗。
   */
  minExp: z.number().int().nonnegative().optional(),
  attrs: z
    .object({ str: z.number(), int: z.number(), con: z.number(), dex: z.number() })
    .optional(),
  skills: z.array(skillRefSchema).default([]),
  /**
   * NPC 战斗激发图（DC-041）：槽 → 特殊功 id。
   * 缺省时服务端按「可激发该槽且等级最高的特殊功」自动挂。
   */
  skillEnable: z.record(enableSlotSchema, id).optional(),
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
  /**
   * 门派辈分（DC-040）：数字越小越尊；弟子落库 generation = 此值 + 1。
   * apprentice_master 必填。
   */
  generation: z.number().int().positive().optional(),
  /** 收徒规则（DC-040）。 */
  recruit: recruitSchema.optional(),
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
      effect: z.enum(["heal_qi", "heal_jing", "restore_neili", "feed", "quench", "cure_qi"]),
      amount: z.number().positive(),
    })
    .optional(),
});

// ---------- 技能（DC-041：基本功 / 特殊功 + 激发槽） ----------
export const skillSchema = z.object({
  id,
  name: z.string().min(1),
  /** basic = 槽本身；special = 可挂到 enableSlots。 */
  kind: z.enum(["basic", "special"]),
  /** 主分类（基本功即其槽；特殊功为展示主系）。 */
  category: skillCategorySchema,
  /**
   * 特殊功可激发的基本槽（对齐 xkx valid_enable）。
   * 基本功必须为空；knowledge 特殊功亦为空。
   */
  enableSlots: z.array(enableSlotSchema).default([]),
  description: z.string().default(""),
  maxLevel: z.number().int().positive().default(500),
  baseLevel: z.number().int().nonnegative().default(0),
});

// ---------- 招式（DC-041：挂在特殊功上，达级解锁，普攻自动抽） ----------
export const moveSchema = z.object({
  id,
  skillId: id,
  name: z.string().min(1),
  /** 所属特殊功原级 ≥ 此值时解锁。 */
  minLevel: z.number().int().nonnegative(),
  /** 伤害百分比加成（对齐 xkx action.damage）。 */
  damage: z.number().int().nonnegative().default(0),
  /** 内功发力加成（对齐 xkx action.force）。 */
  force: z.number().int().nonnegative().default(0),
  /** 身法修正（可为负）。 */
  dodge: z.number().int().default(0),
  /** 战报/请教展示用招式描写（武侠文案）。 */
  description: z.string().min(1),
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
  /** 学会门槛：所属技能原级（DC-041）。 */
  learnMinLevel: z.number().int().nonnegative().default(0),
  /** 额外学会门槛（如需内功原级）。 */
  learnRequires: z.array(z.object({ skillId: id, level: z.number().int().positive() })).default([]),
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

/** 江湖传闻池（批次 D：结构借鉴 storyd，文案原创）。 */
export const rumorSchema = z.object({
  id,
  text: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  weight: z.number().positive().default(1),
});

/**
 * 生计挂机（DC-042/045，对标 pkuxkx 配药/钓鱼新手打工）：
 * 离线按时长发银两/经验/潜能；在线沿 route 跑图，合圈发 roundGain。
 */
export const grindJobSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(""),
  /** 历练超过此值不可再接（0 = 不限）。 */
  maxExp: z.number().int().nonnegative().default(0),
  hourlyGain: z.object({
    exp: z.number().nonnegative(),
    potential: z.number().nonnegative(),
    silver: z.number().nonnegative(),
  }),
  /** 每小时耗精；精尽则挂机失败停止（离线）。 */
  jingPerHour: z.number().nonnegative().default(10),
  /** 在线见闻短句轮换（DC-043 兼容；DC-045 优先 move/work/harvest）。 */
  onlineLines: z.array(z.string().min(1)).default([]),
  /** 在线回路枢纽（DC-045）；缺省则仅离线语义。 */
  hubRoomId: id.optional(),
  /** 有序房间环：首末均为 hub。 */
  route: z.array(id).default([]),
  /** 到达后多停留 1 tick 干活的房间。 */
  workRooms: z.array(id).default([]),
  /** 自动导航白名单（不含主动怪房）。 */
  navWhitelist: z.array(id).default([]),
  /** 合圈基础奖励（再乘 onlineRewardMult）。 */
  roundGain: z
    .object({
      exp: z.number().nonnegative(),
      potential: z.number().nonnegative(),
      silver: z.number().nonnegative(),
    })
    .optional(),
  jingPerRound: z.number().nonnegative().default(0),
  moveLines: z.array(z.string().min(1)).default([]),
  workLines: z.array(z.string().min(1)).default([]),
  harvestLine: z.string().min(1).optional(),
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
// mechanics.yaml 由 load.ts 装载并校验（见 mechanics.ts）；params 为 coeffs 兼容别名。
export const contentPackSchema = z.object({
  manifest: manifestSchema,
  params: paramsSchema,
  rooms: z.array(roomSchema).default([]),
  npcs: z.array(npcSchema).default([]),
  items: z.array(itemSchema).default([]),
  skills: z.array(skillSchema).default([]),
  moves: z.array(moveSchema).default([]),
  performs: z.array(performSchema).default([]),
  quests: z.array(questSchema).default([]),
  story: z.array(storySchema).default([]),
  rumors: z.array(rumorSchema).default([]),
  grindJobs: z.array(grindJobSchema).default([]),
  /** 天下图（可选；缺省时服务端仅返回本域房间图） */
  worldMap: worldMapSchema.optional(),
});

/** 内容包结构（params 为 mechanics.coeffs 别名；加载后另附 mechanics/compiled，见 load.ts）。 */
export type ContentPack = z.infer<typeof contentPackSchema>;
export type Params = z.infer<typeof paramsSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Npc = z.infer<typeof npcSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Move = z.infer<typeof moveSchema>;
export type Perform = z.infer<typeof performSchema>;
export type Quest = z.infer<typeof questSchema>;
export type StoryNode = z.infer<typeof storySchema>;
export type Rumor = z.infer<typeof rumorSchema>;
export type GrindJob = z.infer<typeof grindJobSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type WorldMap = z.infer<typeof worldMapSchema>;
export type WorldMapNode = z.infer<typeof worldMapNodeSchema>;
export type WorldMapRoad = z.infer<typeof worldMapRoadSchema>;
export type EnableSlot = z.infer<typeof enableSlotSchema>;
export type SkillCategory = z.infer<typeof skillCategorySchema>;
