import {
  computeMaxVitals,
  effectivePotential,
  maxFoodCapacity,
  maxWaterCapacity,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";

/** 角色域错误（code 进入错误信封）。 */
export class CharacterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CharacterError";
  }
}

export interface CreateCharacterInput {
  name: string;
  gender: "male" | "female";
  attrs: { str: number; int: number; con: number; dex: number };
}

export interface CharacterSummary {
  id: string;
  name: string;
  gender: string;
  status: string;
  attrs: Record<"str" | "int" | "con" | "dex", { cur: number; base: number }>;
  vitals: { qi: number; jing: number; jingli: number; neili: number; food: number; water: number };
  /** 生存资源上限（V2.9：与当前值成对展示；无内容包时全 0）。 */
  vitalsMax: {
    qi: number;
    jing: number;
    jingli: number;
    neili: number;
    food: number;
    water: number;
  };
  exp: number;
  effectivePotential: number;
  silver: number;
  /** 正式拜师师父 NPC id（DC-039）；收费请教不写。 */
  masterNpcId: string | null;
  /** 门派 id。 */
  sectId: string | null;
  /** 门派辈分（DC-040）；数字越小越尊。 */
  generation: number | null;
  /** 师父名号（内容包解析；无则 null）。 */
  masterName: string | null;
}

export const ATTR_MIN = 10;
export const ATTR_MAX = 30;
export const ATTR_BUDGET = 80;
export const MAX_NAME_LENGTH = 8;
export const START_ROOM = "village_start";
/** 建角赠送并默认穿戴的衣甲（内容包 items/cubu_yi；对齐 xkx 开局布衣）。 */
export const START_CLOTH_ITEM_ID = "cubu_yi";
export const START_CLOTH_SLOT = "armor";
/** 建角起步银两（DC-039：保证未打怪也可请教数次）。 */
export const START_SILVER = 10;

/** 属性分配校验：每项整数 10–30，总和 = 80。返回 null 表示通过。 */
export function validateAttrs(attrs: {
  str: number;
  int: number;
  con: number;
  dex: number;
}): string | null {
  const entries = [attrs.str, attrs.int, attrs.con, attrs.dex];
  for (const v of entries) {
    if (!Number.isInteger(v) || v < ATTR_MIN || v > ATTR_MAX) {
      return `四维需为 ${ATTR_MIN}–${ATTR_MAX} 的整数`;
    }
  }
  if (entries.reduce((a, b) => a + b, 0) !== ATTR_BUDGET) {
    return `四维总和须为 ${ATTR_BUDGET}`;
  }
  return null;
}

export interface CharacterService {
  createCharacter(accountId: string, input: CreateCharacterInput): Promise<{ characterId: string }>;
  getCharacter(accountId: string): Promise<CharacterSummary | null>;
  discardCharacter(accountId: string): Promise<boolean>;
  updateName(accountId: string, name: string): Promise<{ name: string }>;
}

export function createCharacterService(db: Db, content?: ContentPack): CharacterService {
  return {
    async createCharacter(accountId, input) {
      const name = input.name.trim();
      if (!name || [...name].length > MAX_NAME_LENGTH) {
        throw new CharacterError("invalid_name", `名号需为 1–${MAX_NAME_LENGTH} 字`);
      }
      const attrError = validateAttrs(input.attrs);
      if (attrError) throw new CharacterError("invalid_attrs", attrError);

      // 单角色约束（DB 部分唯一索引兜底；先查避免 500）
      const existing = await db.query<{ id: string }>(
        "SELECT id FROM characters WHERE account_id = $1 AND status = 'active'",
        [accountId],
      );
      if (existing.rows[0])
        throw new CharacterError("already_has_character", "你已有一位闯荡江湖的角色");

      // 名号唯一
      const nameTaken = await db.query<{ id: string }>(
        "SELECT id FROM characters WHERE name = $1",
        [name],
      );
      if (nameTaken.rows[0]) throw new CharacterError("name_taken", "名号已被他人取用");

      const created = await db.query<{ id: string }>(
        "INSERT INTO characters (account_id, name, gender, attrs, room_path, safe_room_id, silver) VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id",
        [accountId, name, input.gender, JSON.stringify(input.attrs), START_ROOM, START_SILVER],
      );
      const characterId = created.rows[0]?.id;
      if (!characterId) throw new CharacterError("character_create_failed", "立名失败");

      // 开局默认衣甲：避免“未着寸缕”；粗布衣已装备于 armor 槽（与护具同类，同槽互斥）
      await db.query(
        "INSERT INTO character_items (character_id, item_def_id, quantity, slot) VALUES ($1, $2, 1, $3)",
        [characterId, START_CLOTH_ITEM_ID, START_CLOTH_SLOT],
      );

      return { characterId };
    },

    async getCharacter(accountId) {
      const rows = await db.query<{
        id: string;
        name: string;
        gender: string;
        status: string;
        attrs: Record<string, unknown> | string | undefined;
        exp: number | string;
        potential: number | string;
        learned_points: number | string;
        silver: number | string;
        qi: number;
        jing: number;
        jingli: number;
        neili: number;
        food: number;
        water: number;
        master_npc_id: string | null;
        sect_id: string | null;
        generation: number | null;
      }>(
        "SELECT id, name, gender, status, attrs, exp, potential, learned_points, silver, qi, jing, jingli, neili, food, water, master_npc_id, sect_id, generation FROM characters WHERE account_id = $1 AND status = 'active'",
        [accountId],
      );
      const row = rows.rows[0];
      if (!row) return null;
      const rawAttrs =
        typeof row.attrs === "string"
          ? JSON.parse(row.attrs)
          : (row.attrs ?? ({} as Record<string, unknown>));
      const attribute = (key: "str" | "int" | "con" | "dex") => {
        const value = Number(rawAttrs[key]);
        return {
          cur: Number.isFinite(value) ? value : 0,
          base: Number.isFinite(value) ? value : 0,
        };
      };
      // 生存资源上限（V2.9）：与 sceneService 同一规则引擎（computeMaxVitals），不重复实现公式。
      const attrs = {
        str: attribute("str"),
        int: attribute("int"),
        con: attribute("con"),
        dex: attribute("dex"),
      };
      let vitalsMax: CharacterSummary["vitalsMax"] = {
        qi: 0,
        jing: 0,
        jingli: 0,
        neili: 0,
        food: 0,
        water: 0,
      };
      if (content) {
        const skillsById = new Map(content.skills.map((skill) => [skill.id, skill]));
        const forceRows = await db.query<{ skill_id: string; level: number }>(
          "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
          [row.id],
        );
        const forceLevels = forceRows.rows
          .filter((skill) => skillsById.get(skill.skill_id)?.category === "force")
          .map((skill) => skill.level);
        const forceLevel = forceLevels.length > 0 ? Math.max(...forceLevels) : 0;
        const maxVitals = computeMaxVitals(content.params, {
          str: attrs.str.cur,
          int: attrs.int.cur,
          con: attrs.con.cur,
          dex: attrs.dex.cur,
          forceLevel,
        });
        vitalsMax = {
          qi: maxVitals.maxQi,
          jing: maxVitals.maxJing,
          jingli: maxVitals.maxJingli,
          neili: maxVitals.maxNeili,
          food: maxFoodCapacity(content.params, attrs.con.cur),
          water: maxWaterCapacity(content.params, attrs.dex.cur),
        };
      }
      return {
        id: row.id,
        name: row.name,
        gender: row.gender,
        status: row.status,
        attrs,
        vitals: {
          qi: row.qi,
          jing: row.jing,
          jingli: row.jingli,
          neili: row.neili,
          food: row.food,
          water: row.water,
        },
        vitalsMax,
        exp: Number(row.exp),
        effectivePotential: effectivePotential(Number(row.potential), Number(row.learned_points)),
        silver: Number(row.silver),
        masterNpcId: row.master_npc_id,
        sectId: row.sect_id,
        generation: row.generation == null ? null : Number(row.generation),
        masterName: row.master_npc_id
          ? (content?.npcs.find((n) => n.id === row.master_npc_id)?.name ?? null)
          : null,
      };
    },

    async discardCharacter(accountId) {
      const rows = await db.query<{ id: string }>(
        "UPDATE characters SET status = 'discarded', discarded_at = now() WHERE account_id = $1 AND status = 'active' RETURNING id",
        [accountId],
      );
      return rows.rows.length > 0;
    },

    async updateName(accountId, rawName) {
      const name = rawName.trim();
      if (!name || [...name].length > MAX_NAME_LENGTH) {
        throw new CharacterError("invalid_name", `名号需为 1–${MAX_NAME_LENGTH} 字`);
      }
      const me = await db.query<{ id: string }>(
        "SELECT id FROM characters WHERE account_id = $1 AND status = 'active'",
        [accountId],
      );
      const myId = me.rows[0]?.id;
      if (!myId) throw new CharacterError("no_character", "尚未立名闯江湖");

      const taken = await db.query<{ id: string }>(
        "SELECT id FROM characters WHERE name = $1 AND id <> $2",
        [name, myId],
      );
      if (taken.rows[0]) throw new CharacterError("name_taken", "名号已被他人取用");

      const updated = await db.query<{ name: string }>(
        "UPDATE characters SET name = $1 WHERE id = $2 RETURNING name",
        [name, myId],
      );
      const row = updated.rows[0];
      if (!row) throw new CharacterError("no_character", "尚未立名闯江湖");
      return { name: row.name };
    },
  };
}

export type { DbRow };
