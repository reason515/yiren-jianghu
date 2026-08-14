import type { ContentPack, Npc, Skill } from "@yjh/content";
import {
  ENABLE_SLOTS,
  EnableError,
  applyFieldExert,
  assertCanEnable,
  computeMaxVitals,
  effectiveLevel,
  fieldExertKind,
  getSkill,
  isFieldExertPerform,
  learnUp,
  newlyUnlockedMoves,
  unlockedMoves,
  practiceOnce,
  previewLearnCost,
  resolveEnableMap,
  resolveTeachCap,
  studyOnce,
  type EnableSlot,
  type ExertVitals,
  type SkillEnableMap,
  type SkillMap,
  type SkillRaw,
} from "@yjh/game-core";
import type { Db } from "./db.js";
import { settleCharacterVitals, vitalsContentFromPack } from "./vitalsSettle.js";

/** 武功域错误（code 进入错误信封）。 */
export class SkillsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SkillsError";
  }
}

export interface SkillView {
  id: string;
  name: string;
  category: string;
  /** 基本功（门类本身）/ 特殊功（可挂到 enableSlots，DC-041）。 */
  kind: "basic" | "special";
  /** 特殊功可激发的槎位；基本功恒为空。 */
  enableSlots: EnableSlot[];
  description: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
}

/** 新解锁招式（DC-041：达级自动写入 character_moves）。 */
export interface MoveView {
  id: string;
  name: string;
  skillId: string;
  description: string;
}

/** 已学绝招摘要（DC-041：character_performs；DC-052 含场外运功元数据）。 */
export interface PerformView {
  id: string;
  name: string;
  skillId: string;
  description: string;
  effectType: "damage" | "heal" | "heal_jing" | "buff";
  /** heal 且疗伤语义时为 cure；否则同 effectType 语义标签。 */
  fieldKind: "heal" | "cure" | "heal_jing" | null;
  cost: { qi: number; jing: number; neili: number };
}

export interface EnableInput {
  slot: EnableSlot;
  /** null 表示清空该槎（回退基本功/自动激发）。 */
  skillId: string | null;
}

export interface EnableView {
  skillEnable: SkillEnableMap;
  effective: Record<EnableSlot, number>;
}

export interface LearnPerformInput {
  performId: string;
  npcId: string;
}

export interface LearnPerformResult {
  performId: string;
  performName: string;
  teacher: { id: string; name: string };
}

/** 人物簿「武学」页所需的一站式视图（DC-041）。 */
export interface MasteryView {
  skills: SkillView[];
  skillEnable: SkillEnableMap;
  effective: Record<EnableSlot, number>;
  moves: MoveView[];
  performs: PerformView[];
}

export interface TeachOfferView {
  skillId: string;
  skillName: string;
  currentLevel: number;
  nextLevel: number;
  teachCap: number;
  cost: { silver: number; jing: number; potential: number };
  canLearn: boolean;
  blockedReason?: string;
}

/** DC-041：当面可学绝招报价。 */
export interface TeachPerformOfferView {
  performId: string;
  performName: string;
  skillId: string;
  skillName: string;
  learnMinLevel: number;
  alreadyLearned: boolean;
  canLearn: boolean;
  blockedReason?: string;
}

export interface TeachOfferResult {
  npc: { id: string; name: string; kind: string; sectId?: string };
  offers: TeachOfferView[];
  performOffers: TeachPerformOfferView[];
}

export interface ApprenticeResult {
  masterNpcId: string;
  masterName: string;
  sectId: string;
  generation: number;
  message: string;
}

export interface SkillsService {
  getSkills(accountId: string): Promise<SkillView[] | null>;
  getTeachOffer(accountId: string, npcId: string): Promise<TeachOfferResult>;
  learn(
    accountId: string,
    skillId: string,
    npcId: string,
  ): Promise<{
    skill: SkillView;
    spent: { potential: number; jing: number; silver: number };
    teacher: { id: string; name: string };
    unlockedMoves: MoveView[];
  }>;
  apprentice(accountId: string, npcId: string): Promise<ApprenticeResult>;
  practice(
    accountId: string,
    skillId: string,
    count: number,
  ): Promise<{
    skill: SkillView;
    qiSpent: number;
    leveled: boolean;
    iterations: number;
    unlockedMoves: MoveView[];
  }>;
  study(
    accountId: string,
    skillId: string,
    count: number,
  ): Promise<{
    skill: SkillView;
    jingSpent: number;
    leveled: boolean;
    iterations: number;
    unlockedMoves: MoveView[];
  }>;
  /** 人物簿 GUI 激发（DC-041）：槎 → 特殊功 id；null 清空。 */
  enable(accountId: string, input: EnableInput): Promise<EnableView>;
  /** 学会绝招（DC-041）：须同房师父/教头教授该绝招所属武功，并满足 learnMinLevel/learnRequires。 */
  learnPerform(accountId: string, input: LearnPerformInput): Promise<LearnPerformResult>;
  /** 场外运功（DC-052）：自疗/回气/回精；战斗中不可用。 */
  exert(accountId: string, performId: string): Promise<ExertResultView>;
  /** 武学页一站式视图：技能 + 激发 + 有效等级 + 已学招式/绝招。 */
  getMastery(accountId: string): Promise<MasteryView | null>;
}

export interface ExertResultView {
  performId: string;
  performName: string;
  kind: "heal" | "cure" | "heal_jing";
  amount: number;
  message: string;
  vitals: {
    qi: number;
    jing: number;
    jingli: number;
    neili: number;
    effQi: number;
    effJing: number;
  };
}

export const MAX_PRACTICE_COUNT = 50;

type CharacterRow = {
  id: string;
  exp: number | string;
  potential: number | string;
  learned_points: number | string;
  jing: number;
  qi: number;
  jingli: number;
  neili: number;
  eff_qi: number;
  eff_jing: number;
  silver: number | string;
  room_path: string;
  master_npc_id: string | null;
  sect_id: string | null;
  generation: number | null;
  attrs: { str: number; int: number; con: number; dex: number };
  skill_enable: SkillEnableMap | string | null;
};

function decodeEnableMap(raw: SkillEnableMap | string | null): SkillEnableMap {
  if (!raw) return {};
  return typeof raw === "string" ? (JSON.parse(raw) as SkillEnableMap) : raw;
}

function toPerformView(p: ContentPack["performs"][number]): PerformView {
  return {
    id: p.id,
    name: p.name,
    skillId: p.skillId,
    description: p.description,
    effectType: p.effect.type,
    fieldKind: fieldExertKind(p),
    cost: { qi: p.cost.qi, jing: p.cost.jing, neili: p.cost.neili },
  };
}

const EXERT_MESSAGES: Record<"heal" | "cure" | "heal_jing", string> = {
  heal: "真气游走周身，伤处暖意渐起。",
  cure: "内息温养，淤滞渐松，伤势缓缓合拢。",
  heal_jing: "心神一敛，昏沉散去，眼前重新立得住。",
};

type SkillRow = {
  skill_id: string;
  level: number;
  practice_points: number;
};

function num(v: number | string): number {
  return typeof v === "string" ? Number(v) : v;
}

export function createSkillsService(db: Db, content: ContentPack): SkillsService {
  const skillsById = new Map(content.skills.map((s) => [s.id, s]));
  const npcsById = new Map(content.npcs.map((n) => [n.id, n]));

  const activeCharacter = async (accountId: string): Promise<CharacterRow | null> => {
    const rows = await db.query<CharacterRow>(
      "SELECT id, exp, potential, learned_points, jing, qi, jingli, neili, eff_qi, eff_jing, silver, room_path, master_npc_id, sect_id, generation, attrs, skill_enable FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    const r = rows.rows[0];
    if (!r) return null;
    return { ...r, attrs: r.attrs ?? { str: 0, int: 0, con: 0, dex: 0 } };
  };

  const skillMapOf = async (characterId: string): Promise<SkillMap> => {
    const rows = await db.query<SkillRow>(
      "SELECT skill_id, level, practice_points FROM character_skills WHERE character_id = $1",
      [characterId],
    );
    const map: SkillMap = {};
    for (const r of rows.rows) {
      map[r.skill_id] = { level: r.level, practicePoints: r.practice_points };
    }
    return map;
  };

  const requireSkill = (skillId: string): Skill => {
    const def = skillsById.get(skillId);
    if (!def) throw new SkillsError("skill_not_found", "这门武功不在此界（内容包未收录）");
    return def;
  };

  const requireNpcInRoom = (ch: CharacterRow, npcId: string): Npc => {
    const npc = npcsById.get(npcId);
    if (!npc) throw new SkillsError("npc_not_found", "此地并无此人");
    const room = content.rooms.find((r) => r.id === ch.room_path);
    if (!room || !room.npcIds.includes(npcId)) {
      throw new SkillsError("not_in_room", "对方不在此处，无法当面请教");
    }
    return npc;
  };

  const view = (def: Skill, level: number, practicePoints: number): SkillView => ({
    id: def.id,
    name: def.name,
    category: def.category,
    kind: def.kind,
    enableSlots: def.enableSlots,
    description: def.description,
    level,
    maxLevel: def.maxLevel,
    practicePoints,
  });

  /** 内容包技能定义 + 角色原始等级的合并视图（enable.ts 各函数的统一入参，DC-041）。 */
  const rawSkillsOf = (skills: SkillMap): Map<string, SkillRaw> => {
    const out = new Map<string, SkillRaw>();
    for (const def of content.skills) {
      const prog = skills[def.id];
      out.set(def.id, {
        id: def.id,
        level: prog?.level ?? 0,
        kind: def.kind,
        category: def.category,
        enableSlots: def.enableSlots,
      });
    }
    return out;
  };

  /** 升级达线后自动写入新解锁招式（DC-041），供攻击自动抽式与人物簿展示。 */
  const unlockMoves = async (
    characterId: string,
    skillId: string,
    oldLevel: number,
    newLevel: number,
  ): Promise<MoveView[]> => {
    const moves = newlyUnlockedMoves(skillId, oldLevel, newLevel, content.moves);
    for (const move of moves) {
      await db.query(
        "INSERT INTO character_moves (character_id, move_id) VALUES ($1, $2) ON CONFLICT (character_id, move_id) DO NOTHING",
        [characterId, move.id],
      );
    }
    return moves.map((m) => ({
      id: m.id,
      name: m.name,
      skillId: m.skillId,
      description: m.description,
    }));
  };

  /**
   * 按当前技能等级补齐应解锁招式（修 minLevel=0 历史漏写；幂等）。
   * 首次请教须传 oldLevel=-1，见 unlockMoves 调用处。
   */
  const reconcileUnlockedMoves = async (
    characterId: string,
    skillLevels: Map<string, number>,
  ): Promise<void> => {
    for (const [skillId, level] of skillLevels) {
      if (level <= 0) continue;
      for (const move of unlockedMoves(skillId, level, content.moves)) {
        await db.query(
          "INSERT INTO character_moves (character_id, move_id) VALUES ($1, $2) ON CONFLICT (character_id, move_id) DO NOTHING",
          [characterId, move.id],
        );
      }
    }
  };

  const persistSkills = async (
    characterId: string,
    entries: Array<[string, { level: number; practicePoints: number }]>,
  ): Promise<void> => {
    for (const [skillId, prog] of entries) {
      await db.query(
        "INSERT INTO character_skills (character_id, skill_id, level, practice_points) VALUES ($1, $2, $3, $4) ON CONFLICT (character_id, skill_id) DO UPDATE SET level = EXCLUDED.level, practice_points = EXCLUDED.practice_points",
        [characterId, skillId, prog.level, prog.practicePoints],
      );
    }
  };

  const teacherSkillLevel = (npc: Npc, skillId: string): number => {
    const ref = npc.skills.find((s) => s.skillId === skillId);
    return ref?.level ?? 0;
  };

  const resolveTuition = (npc: Npc, teachTuition: number | undefined): number => {
    if (npc.kind === "apprentice_master") return 0;
    if (typeof teachTuition === "number") return teachTuition;
    return content.params.growth.learnTuitionBase;
  };

  const assertCanLearnFrom = (ch: CharacterRow, npc: Npc): void => {
    if (npc.kind === "tuition_teacher") {
      if ((npc.teaches?.length ?? 0) === 0) {
        throw new SkillsError("cannot_teach", "对方并无传授之艺");
      }
      return;
    }
    if (npc.kind === "apprentice_master") {
      if (!npc.sectId) throw new SkillsError("cannot_teach", "对方未开山立派，无法传功");
      if (!ch.master_npc_id) throw new SkillsError("not_apprentice", "尚未拜师，对方不肯传功");
      // DC-040：只向当前师父请教（对齐 xkx is_apprentice_of）
      if (ch.master_npc_id !== npc.id) {
        throw new SkillsError("not_your_master", "功夫须向自己的师父请教");
      }
      if ((npc.teaches?.length ?? 0) === 0) {
        throw new SkillsError("cannot_teach", "对方此刻无可授之艺");
      }
      return;
    }
    throw new SkillsError("cannot_teach", "对方并非教习之人");
  };

  const assertRecruitOk = async (ch: CharacterRow, npc: Npc): Promise<number> => {
    if (npc.kind !== "apprentice_master") {
      throw new SkillsError("cannot_apprentice", "对方只收学费，不收徒弟");
    }
    if (!npc.sectId || npc.generation == null) {
      throw new SkillsError("cannot_apprentice", "对方未开山立派");
    }
    const recruit = npc.recruit ?? { acceptOutsiders: false, minSkills: [] };
    const nextGen = npc.generation + 1;

    // 门外入门
    if (!ch.sect_id) {
      if (!recruit.acceptOutsiders) {
        throw new SkillsError("need_entry_master", "门外之人，先去寻本门入门师兄拜师");
      }
      return nextGen;
    }

    // 跨门派
    if (ch.sect_id !== npc.sectId) {
      throw new SkillsError("already_apprentice", "你已另有师门，首版不可改投");
    }

    // 已是此人弟子
    if (ch.master_npc_id === npc.id) {
      throw new SkillsError("already_apprentice", "你已是对方门下弟子");
    }

    // 同门改拜：目标辈分须更尊（数字更小）
    const currentMaster = ch.master_npc_id ? npcsById.get(ch.master_npc_id) : undefined;
    const currentMasterGen = currentMaster?.generation;
    if (currentMasterGen == null || !(npc.generation < currentMasterGen)) {
      throw new SkillsError("master_not_senior", "对方辈分未高过你现任师父，不可改拜");
    }

    const skills = await skillMapOf(ch.id);
    for (const req of recruit.minSkills ?? []) {
      const prog = getSkill(skills, req.skillId);
      if (prog.level < req.level) {
        const skillName = skillsById.get(req.skillId)?.name ?? req.skillId;
        throw new SkillsError("recruit_skill", `${skillName}未达 ${req.level} 级，尚不够格改拜`);
      }
    }
    return nextGen;
  };

  const buildOffers = (ch: CharacterRow, npc: Npc, skills: SkillMap): TeachOfferView[] => {
    const offers: TeachOfferView[] = [];
    for (const teach of npc.teaches ?? []) {
      const def = skillsById.get(teach.skillId);
      if (!def) continue;
      const cur = getSkill(skills, teach.skillId);
      const teachCap = resolveTeachCap(
        def.maxLevel,
        teach.maxLevel,
        teacherSkillLevel(npc, teach.skillId),
      );
      const tuition = resolveTuition(npc, teach.tuitionSilver);
      const cost = previewLearnCost({
        params: content.params,
        int: ch.attrs.int,
        currentLevel: cur.level,
        tuitionSilver: tuition,
      });
      const probe = learnUp({
        params: content.params,
        exp: num(ch.exp),
        potential: num(ch.potential),
        learnedPoints: num(ch.learned_points),
        jing: ch.jing,
        int: ch.attrs.int,
        silver: num(ch.silver),
        tuitionSilver: tuition,
        skillId: teach.skillId,
        skills,
        maxLevel: def.maxLevel,
        teachCap,
      });
      let canLearn = true;
      let blockedReason: string | undefined;
      if (!probe.ok) {
        canLearn = false;
        const map: Record<string, string> = {
          exp_gate: "历练不足",
          potential: "潜能不足",
          jing: "精神不济",
          silver: "银两不足",
          max_level: "已臻至境",
          teacher_cap: "师父所能仅止于此",
        };
        blockedReason = map[probe.reason] ?? "暂时无法请教";
      }
      offers.push({
        skillId: teach.skillId,
        skillName: def.name,
        currentLevel: cur.level,
        nextLevel: cost.nextLevel,
        teachCap,
        cost: {
          silver: cost.silver,
          jing: cost.jing,
          potential: cost.potential,
        },
        canLearn,
        blockedReason,
      });
    }
    return offers;
  };

  const buildPerformOffers = async (
    ch: CharacterRow,
    npc: Npc,
    skills: SkillMap,
  ): Promise<TeachPerformOfferView[]> => {
    const taughtSkillIds = new Set((npc.teaches ?? []).map((t) => t.skillId));
    const learnedRows = await db.query<{ perform_id: string }>(
      "SELECT perform_id FROM character_performs WHERE character_id = $1",
      [ch.id],
    );
    const learned = new Set(learnedRows.rows.map((r) => r.perform_id));
    const out: TeachPerformOfferView[] = [];
    for (const perform of content.performs) {
      if (!taughtSkillIds.has(perform.skillId)) continue;
      const skillDef = skillsById.get(perform.skillId);
      if (!skillDef) continue;
      const skillLevel = getSkill(skills, perform.skillId).level;
      const alreadyLearned = learned.has(perform.id);
      let canLearn = !alreadyLearned;
      let blockedReason: string | undefined;
      if (alreadyLearned) {
        blockedReason = "已学会";
        canLearn = false;
      } else if (skillLevel < perform.learnMinLevel) {
        canLearn = false;
        blockedReason = `${skillDef.name}未达 ${perform.learnMinLevel} 级`;
      } else {
        for (const req of perform.learnRequires) {
          const reqLevel = getSkill(skills, req.skillId).level;
          if (reqLevel < req.level) {
            canLearn = false;
            const reqName = skillsById.get(req.skillId)?.name ?? req.skillId;
            blockedReason = `${reqName}未达 ${req.level} 级`;
            break;
          }
        }
      }
      out.push({
        performId: perform.id,
        performName: perform.name,
        skillId: perform.skillId,
        skillName: skillDef.name,
        learnMinLevel: perform.learnMinLevel,
        alreadyLearned,
        canLearn,
        blockedReason,
      });
    }
    return out;
  };

  return {
    async getSkills(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const skills = await skillMapOf(ch.id);
      return content.skills.map((def) => {
        const prog = getSkill(skills, def.id);
        return view(def, prog.level, prog.practicePoints);
      });
    },

    async getTeachOffer(accountId, npcId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const npc = requireNpcInRoom(ch, npcId);
      assertCanLearnFrom(ch, npc);
      const skills = await skillMapOf(ch.id);
      return {
        npc: {
          id: npc.id,
          name: npc.name,
          kind: npc.kind,
          sectId: npc.sectId,
        },
        offers: buildOffers(ch, npc, skills),
        performOffers: await buildPerformOffers(ch, npc, skills),
      };
    },

    async learn(accountId, skillId, npcId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const def = requireSkill(skillId);
      const npc = requireNpcInRoom(ch, npcId);
      assertCanLearnFrom(ch, npc);
      const teach = (npc.teaches ?? []).find((t) => t.skillId === skillId);
      if (!teach) throw new SkillsError("not_taught", "对方不会这门功夫，或尚未传授予你");
      const skills = await skillMapOf(ch.id);
      const teachCap = resolveTeachCap(
        def.maxLevel,
        teach.maxLevel,
        teacherSkillLevel(npc, skillId),
      );
      const tuition = resolveTuition(npc, teach.tuitionSilver);

      const result = learnUp({
        params: content.params,
        exp: num(ch.exp),
        potential: num(ch.potential),
        learnedPoints: num(ch.learned_points),
        jing: ch.jing,
        int: ch.attrs.int,
        silver: num(ch.silver),
        tuitionSilver: tuition,
        skillId,
        skills,
        maxLevel: def.maxLevel,
        teachCap,
      });
      if (!result.ok) {
        const reasonMessage: Record<string, string> = {
          exp_gate: "火候未到，尚需更多江湖历练",
          potential: "悟性所限，潜能不足",
          jing: "精神不济，无法凝神听讲",
          silver: "囊中羞涩，学费不足",
          max_level: "这门武功已臻至境",
          teacher_cap: "师父所能仅止于此，再往上得另寻名家",
        };
        throw new SkillsError(result.reason, reasonMessage[result.reason] ?? "学武受挫");
      }

      // 未学过：oldLevel=-1，才能解锁 minLevel=0 入门招式（getSkill 默认 0 会漏写）。
      const oldLevel = skills[skillId] ? getSkill(skills, skillId).level : -1;
      const next = result.skills[skillId]!;
      await db.query(
        "UPDATE characters SET potential = potential - $1, learned_points = learned_points + $1, jing = jing - $2, silver = silver - $3 WHERE id = $4",
        [result.potentialSpent, result.jingSpent, result.silverSpent, ch.id],
      );
      await persistSkills(ch.id, [[skillId, next]]);
      const unlockedMoves = await unlockMoves(ch.id, skillId, oldLevel, next.level);
      return {
        skill: view(def, next.level, next.practicePoints),
        spent: {
          potential: result.potentialSpent,
          jing: result.jingSpent,
          silver: result.silverSpent,
        },
        teacher: { id: npc.id, name: npc.name },
        unlockedMoves,
      };
    },

    async apprentice(accountId, npcId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const npc = requireNpcInRoom(ch, npcId);
      const generation = await assertRecruitOk(ch, npc);
      const wasUpgrade = Boolean(ch.master_npc_id);
      await db.query(
        "UPDATE characters SET master_npc_id = $1, sect_id = $2, generation = $3 WHERE id = $4",
        [npc.id, npc.sectId, generation, ch.id],
      );
      const message = wasUpgrade
        ? `${npc.name}允你改拜。从今日起，你列本门第 ${generation} 代。`
        : `${npc.name}点头允了。从今日起，你是门下第 ${generation} 代弟子。`;
      return {
        masterNpcId: npc.id,
        masterName: npc.name,
        sectId: npc.sectId!,
        generation,
        message,
      };
    },

    async practice(accountId, skillId, count) {
      const n = Number.isInteger(count) ? count : 1;
      if (n < 1 || n > MAX_PRACTICE_COUNT)
        throw new SkillsError("invalid_count", `单次最多演练 ${MAX_PRACTICE_COUNT} 次`);
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const def = requireSkill(skillId);
      let skills = await skillMapOf(ch.id);
      const startLevel = getSkill(skills, skillId).level;

      let totalQi = 0;
      let leveled = false;
      let iterations = 0;
      for (let i = 0; i < n; i++) {
        const result = practiceOnce({
          params: content.params,
          qi: ch.qi - totalQi,
          skillId,
          skills,
          maxLevel: def.maxLevel,
        });
        if (!result.ok) {
          if (iterations === 0) {
            if (result.reason === "max_level")
              throw new SkillsError("max_level", "这门武功已臻至境");
            throw new SkillsError("qi", "气力不足，练不动了");
          }
          break;
        }
        skills = result.skills;
        totalQi += result.qiSpent;
        leveled = leveled || result.leveled;
        iterations++;
      }

      const next = skills[skillId]!;
      await db.query("UPDATE characters SET qi = qi - $1 WHERE id = $2", [totalQi, ch.id]);
      await persistSkills(ch.id, [[skillId, next]]);
      const unlockedMoves = await unlockMoves(ch.id, skillId, startLevel, next.level);
      return {
        skill: view(def, next.level, next.practicePoints),
        qiSpent: totalQi,
        leveled,
        iterations,
        unlockedMoves,
      };
    },

    async study(accountId, skillId, count) {
      const n = Number.isInteger(count) ? count : 1;
      if (n < 1 || n > MAX_PRACTICE_COUNT)
        throw new SkillsError("invalid_count", `单次最多参悟 ${MAX_PRACTICE_COUNT} 次`);
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const def = requireSkill(skillId);
      let skills = await skillMapOf(ch.id);
      const startLevel = getSkill(skills, skillId).level;

      let totalJing = 0;
      let leveled = false;
      let iterations = 0;
      for (let i = 0; i < n; i++) {
        const result = studyOnce({
          params: content.params,
          jing: ch.jing - totalJing,
          skillId,
          skills,
          maxLevel: def.maxLevel,
        });
        if (!result.ok) {
          if (iterations === 0) {
            if (result.reason === "max_level")
              throw new SkillsError("max_level", "这门武功已臻至境");
            throw new SkillsError("jing", "精神不济，读不进书了");
          }
          break;
        }
        skills = result.skills;
        totalJing += result.jingSpent;
        leveled = leveled || result.leveled;
        iterations++;
      }

      const next = skills[skillId]!;
      await db.query("UPDATE characters SET jing = jing - $1 WHERE id = $2", [totalJing, ch.id]);
      await persistSkills(ch.id, [[skillId, next]]);
      const unlockedMoves = await unlockMoves(ch.id, skillId, startLevel, next.level);
      return {
        skill: view(def, next.level, next.practicePoints),
        jingSpent: totalJing,
        leveled,
        iterations,
        unlockedMoves,
      };
    },

    async enable(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const skills = await skillMapOf(ch.id);
      const raw = rawSkillsOf(skills);
      const current = decodeEnableMap(ch.skill_enable);
      const next: SkillEnableMap = { ...current };
      if (input.skillId === null) {
        // DC-057：显式 null = 强制回退基本功；delete 会导致 resolve 时被 autoEnable 补回。
        next[input.slot] = null;
      } else {
        try {
          assertCanEnable(input.slot, input.skillId, raw);
        } catch (err) {
          if (err instanceof EnableError) throw new SkillsError(err.code, err.message);
          throw err;
        }
        next[input.slot] = input.skillId;
      }
      await db.query("UPDATE characters SET skill_enable = $1 WHERE id = $2", [
        JSON.stringify(next),
        ch.id,
      ]);
      const skillLevels = new Map([...raw].map(([id, s]) => [id, s.level]));
      const resolved = resolveEnableMap(content, skillLevels, next);
      const effective = {} as Record<EnableSlot, number>;
      for (const slot of ENABLE_SLOTS) effective[slot] = effectiveLevel(slot, raw, resolved);
      return { skillEnable: resolved, effective };
    },

    async learnPerform(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const perform = content.performs.find((p) => p.id === input.performId);
      if (!perform) throw new SkillsError("perform_not_found", "此招未在江湖谱中");
      const npc = requireNpcInRoom(ch, input.npcId);
      const teachesThisSkill = (npc.teaches ?? []).some((t) => t.skillId === perform.skillId);

      if (npc.kind === "apprentice_master") {
        // DC-040：绝招同技能一样，只向当前师父请教。
        if (!ch.master_npc_id || ch.master_npc_id !== npc.id) {
          throw new SkillsError("not_your_master", "此招须向自己的师父请教");
        }
      } else if (npc.kind !== "tuition_teacher") {
        throw new SkillsError("cannot_teach", "对方并非教习之人");
      }
      if (!teachesThisSkill) {
        throw new SkillsError("cannot_teach", "对方不曾传授此招所属的武功");
      }

      const already = await db.query<{ perform_id: string }>(
        "SELECT perform_id FROM character_performs WHERE character_id = $1 AND perform_id = $2",
        [ch.id, perform.id],
      );
      if (already.rows[0]) throw new SkillsError("already_learned", "此招已然学会，无需再学");

      const skills = await skillMapOf(ch.id);
      const skillLevel = getSkill(skills, perform.skillId).level;
      if (skillLevel < perform.learnMinLevel) {
        const skillName = skillsById.get(perform.skillId)?.name ?? perform.skillId;
        throw new SkillsError(
          "learn_min_level",
          `${skillName}尚未练到 ${perform.learnMinLevel} 级，难悟此招`,
        );
      }
      for (const req of perform.learnRequires) {
        const reqLevel = getSkill(skills, req.skillId).level;
        if (reqLevel < req.level) {
          const skillName = skillsById.get(req.skillId)?.name ?? req.skillId;
          throw new SkillsError(
            "learn_requires",
            `${skillName}未达 ${req.level} 级，尚不足以悟此招`,
          );
        }
      }

      await db.query("INSERT INTO character_performs (character_id, perform_id) VALUES ($1, $2)", [
        ch.id,
        perform.id,
      ]);
      return {
        performId: perform.id,
        performName: perform.name,
        teacher: { id: npc.id, name: npc.name },
      };
    },

    async exert(accountId, performId) {
      await settleCharacterVitals(db, vitalsContentFromPack(content), accountId);
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");

      const ongoing = await db.query<{ id: string }>(
        "SELECT id FROM combat_sessions WHERE character_id = $1 AND kind = 'pve' AND status = 'ongoing' LIMIT 1",
        [ch.id],
      );
      if (ongoing.rows[0]) {
        throw new SkillsError("in_combat", "交手之中，难以静心运功");
      }

      const perform = content.performs.find((p) => p.id === performId);
      if (!perform) throw new SkillsError("perform_not_found", "此式未在江湖谱中");
      if (!isFieldExertPerform(perform)) {
        throw new SkillsError("not_field_exert", "此式不可场外运功");
      }

      const learned = await db.query<{ perform_id: string }>(
        "SELECT perform_id FROM character_performs WHERE character_id = $1 AND perform_id = $2",
        [ch.id, perform.id],
      );
      if (!learned.rows[0]) throw new SkillsError("perform_not_learned", "此式尚未参悟");

      const skills = await skillMapOf(ch.id);
      const skillLevel = getSkill(skills, perform.skillId).level;
      const forceLevel = content.skills
        .filter((s) => s.category === "force")
        .reduce((acc, s) => Math.max(acc, getSkill(skills, s.id).level), 0);
      const maxVitals = computeMaxVitals(content.params, {
        str: ch.attrs.str,
        int: ch.attrs.int,
        con: ch.attrs.con,
        dex: ch.attrs.dex,
        forceLevel,
      });

      const before: ExertVitals = {
        qi: ch.qi,
        maxQi: maxVitals.maxQi,
        effQi: Math.min(maxVitals.maxQi, Math.max(0, Number(ch.eff_qi) || ch.qi)),
        jing: ch.jing,
        maxJing: maxVitals.maxJing,
        effJing: Math.min(maxVitals.maxJing, Math.max(0, Number(ch.eff_jing) || ch.jing)),
        neili: ch.neili,
        maxNeili: maxVitals.maxNeili,
      };

      const result = applyFieldExert({
        perform,
        learned: true,
        skillLevel,
        vitals: before,
        params: content.params,
      });
      if (!result.ok) {
        if (result.reason === "cost") throw new SkillsError("perform_cost", "真气未复，此式难发");
        if (result.reason === "condition")
          throw new SkillsError("perform_condition", "此刻气机未合，难以运功");
        if (result.reason === "no_effect") throw new SkillsError("no_effect", "气机已满，无需再运");
        throw new SkillsError("exert_failed", result.detail ?? "运功未成");
      }

      await db.query(
        "UPDATE characters SET qi = $1, jing = $2, neili = $3, eff_qi = $4, eff_jing = $5 WHERE id = $6",
        [
          result.vitals.qi,
          result.vitals.jing,
          result.vitals.neili,
          result.vitals.effQi,
          result.vitals.effJing,
          ch.id,
        ],
      );

      return {
        performId: perform.id,
        performName: perform.name,
        kind: result.kind,
        amount: result.amount,
        message: EXERT_MESSAGES[result.kind],
        vitals: {
          qi: result.vitals.qi,
          jing: result.vitals.jing,
          jingli: ch.jingli,
          neili: result.vitals.neili,
          effQi: result.vitals.effQi,
          effJing: result.vitals.effJing,
        },
      };
    },

    async getMastery(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const skills = await skillMapOf(ch.id);
      const raw = rawSkillsOf(skills);
      const skillLevels = new Map([...raw].map(([id, s]) => [id, s.level]));
      await reconcileUnlockedMoves(ch.id, skillLevels);
      const enableMap = resolveEnableMap(content, skillLevels, decodeEnableMap(ch.skill_enable));
      const effective = {} as Record<EnableSlot, number>;
      for (const slot of ENABLE_SLOTS) effective[slot] = effectiveLevel(slot, raw, enableMap);

      const moveRows = await db.query<{ move_id: string }>(
        "SELECT move_id FROM character_moves WHERE character_id = $1",
        [ch.id],
      );
      const learnedMoveIds = new Set(moveRows.rows.map((row) => row.move_id));
      const performRows = await db.query<{ perform_id: string }>(
        "SELECT perform_id FROM character_performs WHERE character_id = $1",
        [ch.id],
      );
      const learnedPerformIds = new Set(performRows.rows.map((row) => row.perform_id));

      return {
        skills: content.skills.map((def) => {
          const prog = getSkill(skills, def.id);
          return view(def, prog.level, prog.practicePoints);
        }),
        skillEnable: enableMap,
        effective,
        moves: content.moves
          .filter((m) => learnedMoveIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, skillId: m.skillId, description: m.description })),
        performs: content.performs
          .filter((p) => learnedPerformIds.has(p.id))
          .map((p) => toPerformView(p)),
      };
    },
  };
}
