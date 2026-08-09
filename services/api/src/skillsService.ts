import type { ContentPack, Npc, Skill } from "@yjh/content";
import {
  getSkill,
  learnUp,
  practiceOnce,
  previewLearnCost,
  resolveTeachCap,
  studyOnce,
  type SkillMap,
} from "@yjh/game-core";
import type { Db } from "./db.js";

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
  description: string;
  level: number;
  maxLevel: number;
  practicePoints: number;
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

export interface TeachOfferResult {
  npc: { id: string; name: string; kind: string; sectId?: string };
  offers: TeachOfferView[];
}

export interface ApprenticeResult {
  masterNpcId: string;
  masterName: string;
  sectId: string;
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
  }>;
}

export const MAX_PRACTICE_COUNT = 50;

type CharacterRow = {
  id: string;
  exp: number | string;
  potential: number | string;
  learned_points: number | string;
  jing: number;
  qi: number;
  silver: number | string;
  room_path: string;
  master_npc_id: string | null;
  sect_id: string | null;
  attrs: { str: number; int: number; con: number; dex: number };
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
      "SELECT id, exp, potential, learned_points, jing, qi, silver, room_path, master_npc_id, sect_id, attrs FROM characters WHERE account_id = $1 AND status = 'active'",
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
    description: def.description,
    level,
    maxLevel: def.maxLevel,
    practicePoints,
  });

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
      if (!ch.sect_id) throw new SkillsError("not_apprentice", "尚未拜入师门，对方不肯传功");
      if (ch.sect_id !== npc.sectId) {
        throw new SkillsError("wrong_sect", "你已另有师门，不可再学此处功夫");
      }
      if ((npc.teaches?.length ?? 0) === 0) {
        throw new SkillsError("cannot_teach", "对方此刻无可授之艺");
      }
      return;
    }
    throw new SkillsError("cannot_teach", "对方并非教习之人");
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
          exp_gate: "火候未到，尚需更多江湖历练（经验不足）",
          potential: "悟性所限，潜能不足",
          jing: "精神不济，无法凝神听讲",
          silver: "囊中羞涩，学费不足",
          max_level: "这门武功已臻至境",
          teacher_cap: "师父所能仅止于此，再往上得另寻名家",
        };
        throw new SkillsError(result.reason, reasonMessage[result.reason] ?? "学武受挫");
      }

      const next = result.skills[skillId]!;
      await db.query(
        "UPDATE characters SET potential = potential - $1, learned_points = learned_points + $1, jing = jing - $2, silver = silver - $3 WHERE id = $4",
        [result.potentialSpent, result.jingSpent, result.silverSpent, ch.id],
      );
      await persistSkills(ch.id, [[skillId, next]]);
      return {
        skill: view(def, next.level, next.practicePoints),
        spent: {
          potential: result.potentialSpent,
          jing: result.jingSpent,
          silver: result.silverSpent,
        },
        teacher: { id: npc.id, name: npc.name },
      };
    },

    async apprentice(accountId, npcId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const npc = requireNpcInRoom(ch, npcId);
      if (npc.kind !== "apprentice_master") {
        throw new SkillsError("cannot_apprentice", "对方只收学费，不收徒弟");
      }
      if (!npc.sectId) throw new SkillsError("cannot_apprentice", "对方未开山立派");
      if (ch.sect_id) {
        if (ch.sect_id === npc.sectId) {
          throw new SkillsError("already_apprentice", "你已是本门弟子");
        }
        throw new SkillsError("already_apprentice", "你已另有师门，首版不可改投");
      }
      await db.query("UPDATE characters SET master_npc_id = $1, sect_id = $2 WHERE id = $3", [
        npc.id,
        npc.sectId,
        ch.id,
      ]);
      return {
        masterNpcId: npc.id,
        masterName: npc.name,
        sectId: npc.sectId,
        message: `${npc.name}点头允了。从今日起，你便是门下弟子。`,
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
      return {
        skill: view(def, next.level, next.practicePoints),
        qiSpent: totalQi,
        leveled,
        iterations,
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
      return {
        skill: view(def, next.level, next.practicePoints),
        jingSpent: totalJing,
        leveled,
        iterations,
      };
    },
  };
}
