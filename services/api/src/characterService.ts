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
}

export const ATTR_MIN = 10;
export const ATTR_MAX = 30;
export const ATTR_BUDGET = 80;
export const MAX_NAME_LENGTH = 8;
export const START_ROOM = "village_start";

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
}

export function createCharacterService(db: Db): CharacterService {
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
        "INSERT INTO characters (account_id, name, gender, attrs, room_path, safe_room_id) VALUES ($1, $2, $3, $4, $5, $5) RETURNING id",
        [accountId, name, input.gender, JSON.stringify(input.attrs), START_ROOM],
      );
      const characterId = created.rows[0]?.id;
      if (!characterId) throw new CharacterError("character_create_failed", "立名失败");
      return { characterId };
    },

    async getCharacter(accountId) {
      const rows = await db.query<{ id: string; name: string; gender: string; status: string }>(
        "SELECT id, name, gender, status FROM characters WHERE account_id = $1 AND status = 'active'",
        [accountId],
      );
      const row = rows.rows[0];
      return row ? { id: row.id, name: row.name, gender: row.gender, status: row.status } : null;
    },

    async discardCharacter(accountId) {
      const rows = await db.query<{ id: string }>(
        "UPDATE characters SET status = 'discarded', discarded_at = now() WHERE account_id = $1 AND status = 'active' RETURNING id",
        [accountId],
      );
      return rows.rows.length > 0;
    },
  };
}

export type { DbRow };
