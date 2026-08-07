import type { ContentPack, Skill } from "@yjh/content";
import { getSkill, learnUp, practiceOnce, studyOnce, type SkillMap } from "@yjh/game-core";
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

export interface SkillsService {
  getSkills(accountId: string): Promise<SkillView[] | null>;
  learn(
    accountId: string,
    skillId: string,
  ): Promise<{
    skill: SkillView;
    spent: { potential: number; jing: number };
  }>;
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
  exp: number;
  potential: number;
  learned_points: number;
  jing: number;
  qi: number;
  attrs: { str: number; int: number; con: number; dex: number };
};

type SkillRow = {
  skill_id: string;
  level: number;
  practice_points: number;
};

export function createSkillsService(db: Db, content: ContentPack): SkillsService {
  const skillsByCategory = new Map(content.skills.map((s) => [s.id, s]));

  const activeCharacter = async (accountId: string): Promise<CharacterRow | null> => {
    const rows = await db.query<CharacterRow>(
      "SELECT id, exp, potential, learned_points, jing, qi, attrs FROM characters WHERE account_id = $1 AND status = 'active'",
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
    const def = skillsByCategory.get(skillId);
    if (!def) throw new SkillsError("skill_not_found", "这门武功不在此界（内容包未收录）");
    return def;
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

    async learn(accountId, skillId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new SkillsError("no_character", "尚未立名闯江湖");
      const def = requireSkill(skillId);
      const skills = await skillMapOf(ch.id);

      const result = learnUp({
        params: content.params,
        exp: ch.exp,
        potential: ch.potential,
        learnedPoints: ch.learned_points,
        jing: ch.jing,
        int: ch.attrs.int,
        skillId,
        skills,
        maxLevel: def.maxLevel,
      });
      if (!result.ok) {
        const reasonMessage: Record<string, string> = {
          exp_gate: "火候未到，尚需更多江湖历练（经验不足）",
          potential: "悟性所限，潜能不足",
          jing: "精神不济，无法凝神听讲",
          max_level: "这门武功已臻至境",
        };
        throw new SkillsError(result.reason, reasonMessage[result.reason] ?? "学武受挫");
      }

      const next = result.skills[skillId]!;
      await db.query(
        "UPDATE characters SET potential = potential - $1, learned_points = learned_points + $1, jing = jing - $2 WHERE id = $3",
        [result.potentialSpent, result.jingSpent, ch.id],
      );
      await persistSkills(ch.id, [[skillId, next]]);
      return {
        skill: view(def, next.level, next.practicePoints),
        spent: { potential: result.potentialSpent, jing: result.jingSpent },
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
          break; // 中途力竭：保留已练部分
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
