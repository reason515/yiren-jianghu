import { applyRegen, computeMaxVitals, type GameParams, type VitalsState } from "@yjh/game-core";
import type { Db } from "./db.js";

/** 结算所需的最小内容视图（ContentPack / ContentIndex 均可适配）。 */
export interface VitalsSettleContent {
  params: GameParams;
  getSkillCategory(skillId: string): string | undefined;
}

type HealRow = {
  id: string;
  qi: number;
  jing: number;
  jingli: number;
  neili: number;
  food: number;
  water: number;
  attrs: string | Record<string, unknown> | null;
  last_heal_at: string | Date | null;
};

/**
 * V2.12 / DC-044：按距上次结算的时间差恢复气精等，并消耗食水。
 * 在 getScene / move / act / getCharacter / resume 入口调用；1 分钟内不结算。
 * last_heal_at 为空时只初始化时钟（不补发离线恢复），避免新建角色永久跳过结算。
 */
export async function settleCharacterVitals(
  database: Db,
  content: VitalsSettleContent,
  accountId: string,
): Promise<VitalsState | null> {
  const rows = await database.query<HealRow>(
    "SELECT id, qi, jing, jingli, neili, food, water, attrs, last_heal_at FROM characters WHERE account_id = $1 AND status = 'active'",
    [accountId],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const current: VitalsState = {
    qi: row.qi,
    jing: row.jing,
    jingli: row.jingli,
    neili: row.neili,
    food: row.food,
    water: row.water,
    effQi: row.qi,
    effJing: row.jing,
  };

  if (!row.last_heal_at) {
    await database.query("UPDATE characters SET last_heal_at = now() WHERE id = $1", [row.id]);
    return current;
  }

  const deltaMinutes = (Date.now() - new Date(row.last_heal_at).getTime()) / 60000;
  if (deltaMinutes < 1) return current;

  const rawAttrs = typeof row.attrs === "string" ? JSON.parse(row.attrs) : (row.attrs ?? {});
  const num = (key: string): number => {
    const value = Number((rawAttrs as Record<string, unknown>)[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const forceRows = await database.query<{ skill_id: string; level: number }>(
    "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
    [row.id],
  );
  const forceLevel = forceRows.rows
    .filter((skill) => content.getSkillCategory(skill.skill_id) === "force")
    .reduce((acc, skill) => Math.max(acc, skill.level), 0);
  const maxVitals = computeMaxVitals(content.params, {
    str: num("str"),
    int: num("int"),
    con: num("con"),
    dex: num("dex"),
    forceLevel,
  });
  const next = applyRegen(current, maxVitals, deltaMinutes, content.params);
  await database.query(
    "UPDATE characters SET qi = $1, jing = $2, jingli = $3, neili = $4, food = $5, water = $6, last_heal_at = now() WHERE id = $7",
    [next.qi, next.jing, next.jingli, next.neili, next.food, next.water, row.id],
  );
  return next;
}

export function vitalsContentFromPack(pack: {
  params: GameParams;
  skills: Array<{ id: string; category: string }>;
}): VitalsSettleContent {
  const byId = new Map(pack.skills.map((skill) => [skill.id, skill.category]));
  return {
    params: pack.params,
    getSkillCategory: (skillId) => byId.get(skillId),
  };
}

export function vitalsContentFromIndex(index: {
  params: GameParams;
  skills: Map<string, { category: string }>;
}): VitalsSettleContent {
  return {
    params: index.params,
    getSkillCategory: (skillId) => index.skills.get(skillId)?.category,
  };
}
