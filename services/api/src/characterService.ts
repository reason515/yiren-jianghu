import {
  acquiredAttrs,
  attrLevelsFromSkills,
  buildCharacterCombatant,
  computeMaxVitals,
  ENABLE_SLOTS,
  effectiveLevel,
  effectivePotential,
  fieldExertKind,
  resolveEnableMap,
  type EnableSlot,
  type SkillEnableMap,
  type SkillRaw,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";
import { settleCharacterVitals, vitalsContentFromPack } from "./vitalsSettle.js";

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
  vitals: { qi: number; jing: number; jingli: number; neili: number };
  /** 生存资源上限（V2.9：与当前值成对展示；无内容包时全 0）。 */
  vitalsMax: {
    qi: number;
    jing: number;
    jingli: number;
    neili: number;
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
  /** 激发图（DC-041：槎 → 特殊功 id；缺省槎已按 autoEnableMap 补齐）。 */
  skillEnable: SkillEnableMap;
  /** 各槎有效等级（DC-056：临敌摘要；无内容包时为空）。 */
  effective: Partial<Record<EnableSlot, number>>;
  /** 已学招式（DC-041，character_moves）。 */
  moves: Array<{ id: string; name: string; skillId: string }>;
  /** 已学绝招（DC-041，character_performs；DC-052 附场外运功元数据）。 */
  performs: Array<{
    id: string;
    name: string;
    skillId: string;
    effectType?: "damage" | "heal" | "heal_jing" | "buff";
    fieldKind?: "heal" | "cure" | "heal_jing" | null;
    cost?: { qi: number; jing: number; neili: number };
  }>;
  /** 服务端以当前四维、武学和已佩挂物品计算的战斗展示数值。 */
  combat: { attack: number; defense: number };
}

export const ATTR_MIN = 10;
export const ATTR_MAX = 30;
export const ATTR_BUDGET = 80;
export const MAX_NAME_LENGTH = 8;
export const START_ROOM = "village_start";
/** 建角赠送并默认穿戴的衣甲（内容包 items/cubu_yi；对齐 xkx 开局布衣）。 */
export const START_CLOTH_ITEM_ID = "cubu_yi";
export const START_CLOTH_SLOT = "armor";
/** 建角赠送并默认佩戴的铁剑（DC-055：学剑有兵器，首战不空手）。 */
export const START_SWORD_ITEM_ID = "iron_sword";
export const START_SWORD_SLOT = "weapon";
/** 建角起步银两（DC-039：保证未打怪也可请教数次）。 */
export const START_SILVER = 10;
/** 建角起步潜能（DC-055：0→1 豁免历练后仍需 1 点潜能学第一级）。 */
export const START_POTENTIAL = 10;

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
        "INSERT INTO characters (account_id, name, gender, attrs, room_path, safe_room_id, silver, potential, last_heal_at) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, now()) RETURNING id",
        [
          accountId,
          name,
          input.gender,
          JSON.stringify(input.attrs),
          START_ROOM,
          START_SILVER,
          START_POTENTIAL,
        ],
      );
      const characterId = created.rows[0]?.id;
      if (!characterId) throw new CharacterError("character_create_failed", "立名失败");

      // 开局默认衣甲：避免“未着寸缕”；粗布衣已装备于 armor 槽（与护具同类，同槽互斥）
      await db.query(
        "INSERT INTO character_items (character_id, item_def_id, quantity, slot) VALUES ($1, $2, 1, $3)",
        [characterId, START_CLOTH_ITEM_ID, START_CLOTH_SLOT],
      );
      // DC-055：开局铁剑佩于 weapon 槽，学剑后首战有兵器
      await db.query(
        "INSERT INTO character_items (character_id, item_def_id, quantity, slot) VALUES ($1, $2, 1, $3)",
        [characterId, START_SWORD_ITEM_ID, START_SWORD_SLOT],
      );

      if (content) {
        const maxVitals = computeMaxVitals(content.params, { ...input.attrs, forceLevel: 0 });
        await db.query(
          "UPDATE characters SET qi = $1, jing = $2, jingli = $3, neili = $4, eff_qi = $5, eff_jing = $6 WHERE id = $7",
          [
            maxVitals.maxQi,
            maxVitals.maxJing,
            maxVitals.maxJingli,
            maxVitals.maxNeili,
            maxVitals.maxQi,
            maxVitals.maxJing,
            characterId,
          ],
        );
      }

      return { characterId };
    },

    async getCharacter(accountId) {
      // DC-044 / DC-058：读档前先结算自然恢复，保证人物簿与顶栏看到最新状态。
      if (content) {
        await settleCharacterVitals(db, vitalsContentFromPack(content), accountId);
      }
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
        master_npc_id: string | null;
        sect_id: string | null;
        generation: number | null;
        skill_enable: SkillEnableMap | string | null;
      }>(
        "SELECT id, name, gender, status, attrs, exp, potential, learned_points, silver, qi, jing, jingli, neili, master_npc_id, sect_id, generation, skill_enable FROM characters WHERE account_id = $1 AND status = 'active'",
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
        const base = Number.isFinite(value) ? value : 0;
        return { cur: base, base };
      };
      // 生存资源上限（V2.9）：与 sceneService 同一规则引擎（computeMaxVitals），不重复实现公式。
      let attrs = {
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
      };
      // DC-041/057：激发图与已学招式/绝招（缺键按 autoEnableMap 补齐；显式 null=强制卸下）；无内容包时全空兜底。
      let skillEnable: SkillEnableMap = {};
      const effective: CharacterSummary["effective"] = {};
      let moves: CharacterSummary["moves"] = [];
      let performs: CharacterSummary["performs"] = [];
      let combat: CharacterSummary["combat"] = { attack: 0, defense: 0 };
      if (content) {
        const skillRows = await db.query<{ skill_id: string; level: number }>(
          "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
          [row.id],
        );
        const skillLevels = new Map(skillRows.rows.map((skill) => [skill.skill_id, skill.level]));
        const storedEnable =
          typeof row.skill_enable === "string"
            ? (JSON.parse(row.skill_enable) as SkillEnableMap)
            : (row.skill_enable ?? {});
        skillEnable = resolveEnableMap(content, skillLevels, storedEnable);
        const skillMap = new Map<string, SkillRaw>();
        const skillList: Array<{ category: string; level: number }> = [];
        for (const [id, level] of skillLevels) {
          const def = content.skills.find((skill) => skill.id === id);
          if (!def) continue;
          skillMap.set(id, {
            id,
            level,
            kind: def.kind,
            category: def.category,
            enableSlots: def.enableSlots,
          });
          skillList.push({ category: def.category, level });
        }
        for (const slot of ENABLE_SLOTS) {
          effective[slot] = effectiveLevel(slot, skillMap, skillEnable, content.params);
        }
        const forceLevel = effective.force ?? 0;
        const dodgeLevel = effective.dodge ?? 0;
        const unarmedLevel = effective.unarmed ?? 0;
        const cur = acquiredAttrs(
          {
            str: attrs.str.base,
            int: attrs.int.base,
            con: attrs.con.base,
            dex: attrs.dex.base,
          },
          attrLevelsFromSkills(skillList, {
            force: forceLevel,
            dodge: dodgeLevel,
            unarmed: unarmedLevel,
          }),
        );
        attrs = {
          str: { cur: cur.str, base: attrs.str.base },
          int: { cur: cur.int, base: attrs.int.base },
          con: { cur: cur.con, base: attrs.con.base },
          dex: { cur: cur.dex, base: attrs.dex.base },
        };
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
        };
        const equippedRows = await db.query<{ item_def_id: string }>(
          "SELECT item_def_id FROM character_items WHERE character_id = $1 AND slot IS NOT NULL",
          [row.id],
        );
        const equippedItemIds = equippedRows.rows.map((item) => item.item_def_id);
        const hasWeapon = equippedItemIds.some(
          (itemId) => content.items.find((item) => item.id === itemId)?.kind === "weapon",
        );
        const combatant = buildCharacterCombatant(
          content,
          {
            id: row.id,
            name: row.name,
            attrs: {
              str: attrs.str.base,
              int: attrs.int.base,
              con: attrs.con.base,
              dex: attrs.dex.base,
            },
            exp: Number(row.exp),
            equippedItemIds,
          },
          skillLevels,
          "full",
          skillEnable,
          hasWeapon,
        );
        combat = { attack: combatant.stats.attack, defense: combatant.stats.defense };
        const [moveRows, performRows] = await Promise.all([
          db.query<{ move_id: string }>(
            "SELECT move_id FROM character_moves WHERE character_id = $1",
            [row.id],
          ),
          db.query<{ perform_id: string }>(
            "SELECT perform_id FROM character_performs WHERE character_id = $1",
            [row.id],
          ),
        ]);
        const movesById = new Map(content.moves.map((move) => [move.id, move]));
        const performsById = new Map(content.performs.map((perform) => [perform.id, perform]));
        moves = moveRows.rows.flatMap((r) => {
          const def = movesById.get(r.move_id);
          return def ? [{ id: def.id, name: def.name, skillId: def.skillId }] : [];
        });
        performs = performRows.rows.flatMap((r) => {
          const def = performsById.get(r.perform_id);
          if (!def) return [];
          return [
            {
              id: def.id,
              name: def.name,
              skillId: def.skillId,
              effectType: def.effect.type,
              fieldKind: fieldExertKind(def),
              cost: { qi: def.cost.qi, jing: def.cost.jing, neili: def.cost.neili },
            },
          ];
        });
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
        },
        vitalsMax,
        exp: Number(row.exp),
        effectivePotential: effectivePotential(Number(row.potential), Number(row.learned_points)),
        silver: Number(row.silver),
        skillEnable,
        effective,
        moves,
        performs,
        combat,
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
