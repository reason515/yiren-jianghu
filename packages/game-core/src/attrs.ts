/**
 * 后天四维（DC-047）：查询时叠算，非升级写库。
 * 对齐 pkuxkx attribute.c：force/10→con、dodge/10→dex、unarmed/10→str、knowledge/10→int。
 */

export interface BaseAttrs {
  str: number;
  int: number;
  con: number;
  dex: number;
}

/** 用于叠算的技能有效（或原）等级。 */
export interface AttrSkillLevels {
  force: number;
  dodge: number;
  unarmed: number;
  /** knowledge 门类技能取最高原级。 */
  knowledge: number;
}

export const ATTR_SKILL_DIVISOR = 10;

/** 后天（当前）= 先天 + floor(对应技能等级 / 10)。 */
export function acquiredAttrs(
  base: BaseAttrs,
  levels: AttrSkillLevels,
  divisor = ATTR_SKILL_DIVISOR,
): BaseAttrs {
  const d = Math.max(1, divisor);
  return {
    str: base.str + Math.floor(Math.max(0, levels.unarmed) / d),
    int: base.int + Math.floor(Math.max(0, levels.knowledge) / d),
    con: base.con + Math.floor(Math.max(0, levels.force) / d),
    dex: base.dex + Math.floor(Math.max(0, levels.dodge) / d),
  };
}

/** 从技能列表提取叠算用等级（force/dodge/unarmed 取传入有效等级；knowledge 取列表最高）。 */
export function attrLevelsFromSkills(
  skills: Array<{ category: string; level: number; kind?: string }>,
  effective: { force: number; dodge: number; unarmed: number },
): AttrSkillLevels {
  let knowledge = 0;
  for (const skill of skills) {
    if (skill.category === "knowledge") {
      knowledge = Math.max(knowledge, skill.level);
    }
  }
  return {
    force: effective.force,
    dodge: effective.dodge,
    unarmed: effective.unarmed,
    knowledge,
  };
}
