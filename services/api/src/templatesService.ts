import { tacticTemplateSchema, validateTacticTemplate, type TacticTemplate } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db } from "./db.js";

/** 战术模板域错误（code 进入错误信封）。 */
export class TemplatesError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TemplatesError";
  }
}

export const MAX_TEMPLATES = 12;
export const MAX_TEMPLATE_NAME = 12;

export interface TemplateView {
  id: string;
  name: string;
  /** game-core tacticTemplateSchema 契约（客户端 draft 需先转 type 语义）。 */
  config: TacticTemplate;
  isDefaultPvp: boolean;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  config: TacticTemplate;
  isDefaultPvp?: boolean;
}

export interface TemplatesService {
  list(accountId: string): Promise<TemplateView[] | null>;
  create(accountId: string, input: TemplateInput): Promise<TemplateView>;
  update(accountId: string, id: string, input: TemplateInput): Promise<TemplateView>;
  remove(accountId: string, id: string): Promise<void>;
}

type TemplateRow = {
  id: string;
  name: string;
  config: string | TacticTemplate;
  is_default_pvp: boolean;
  updated_at: string;
};

export function createTemplatesService(db: Db, content: ContentPack): TemplatesService {
  const performsById = new Map(content.performs.map((p) => [p.id, p]));

  const activeCharacter = async (accountId: string): Promise<{ id: string } | null> => {
    const rows = await db.query<{ id: string }>(
      "SELECT id FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const skillLevelsOf = async (characterId: string): Promise<Map<string, number>> => {
    const rows = await db.query<{ skill_id: string; level: number }>(
      "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
      [characterId],
    );
    return new Map(rows.rows.map((r) => [r.skill_id, r.level]));
  };

  const validateConfig = (config: TacticTemplate, skillLevels: Map<string, number>): void => {
    const parsed = tacticTemplateSchema.safeParse(config);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new TemplatesError("invalid_config", `战术模板不合规：${first?.message ?? "结构错误"}`);
    }
    const issues = validateTacticTemplate(parsed.data, {
      performs: performsById,
      skillLevels,
    });
    const err = issues.find((i) => i.severity === "error");
    if (err) throw new TemplatesError("invalid_tactic", `战术模板无效：${err.message}`);
  };

  const view = (row: TemplateRow): TemplateView => ({
    id: row.id,
    name: row.name,
    config:
      typeof row.config === "string" ? (JSON.parse(row.config) as TacticTemplate) : row.config,
    isDefaultPvp: row.is_default_pvp,
    updatedAt: row.updated_at,
  });

  const clearDefaultPvp = async (characterId: string, exceptId?: string): Promise<void> => {
    await db.query(
      "UPDATE tactic_templates SET is_default_pvp = false WHERE character_id = $1 AND ($2::uuid IS NULL OR id <> $2)",
      [characterId, exceptId ?? null],
    );
  };

  return {
    async list(accountId) {
      const ch = await activeCharacter(accountId);
      if (!ch) return null;
      const rows = await db.query<TemplateRow>(
        "SELECT id, name, config, is_default_pvp, updated_at FROM tactic_templates WHERE character_id = $1 ORDER BY updated_at DESC",
        [ch.id],
      );
      return rows.rows.map(view);
    },

    async create(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new TemplatesError("no_character", "尚未立名闯江湖");
      const name = input.name.trim();
      if (!name || [...name].length > MAX_TEMPLATE_NAME) {
        throw new TemplatesError("invalid_name", `模板名需为 1–${MAX_TEMPLATE_NAME} 字`);
      }
      const skillLevels = await skillLevelsOf(ch.id);
      validateConfig(input.config, skillLevels);

      const count = await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM tactic_templates WHERE character_id = $1",
        [ch.id],
      );
      if (Number(count.rows[0]?.n ?? 0) >= MAX_TEMPLATES) {
        throw new TemplatesError("too_many", `最多保存 ${MAX_TEMPLATES} 份战术`);
      }

      if (input.isDefaultPvp) await clearDefaultPvp(ch.id);
      const created = await db.query<TemplateRow>(
        "INSERT INTO tactic_templates (character_id, name, config, is_default_pvp) VALUES ($1, $2, $3, $4) RETURNING id, name, config, is_default_pvp, updated_at",
        [ch.id, name, JSON.stringify(input.config), Boolean(input.isDefaultPvp)],
      );
      const row = created.rows[0];
      if (!row) throw new TemplatesError("create_failed", "战术未能落墨");
      return view(row);
    },

    async update(accountId, id, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new TemplatesError("no_character", "尚未立名闯江湖");
      const rows = await db.query<TemplateRow>(
        "SELECT id, name, config, is_default_pvp, updated_at FROM tactic_templates WHERE id = $1 AND character_id = $2",
        [id, ch.id],
      );
      const row = rows.rows[0];
      if (!row) throw new TemplatesError("not_found", "这份战术不在你的剑谱里");

      const name = input.name.trim();
      if (!name || [...name].length > MAX_TEMPLATE_NAME) {
        throw new TemplatesError("invalid_name", `模板名需为 1–${MAX_TEMPLATE_NAME} 字`);
      }
      const skillLevels = await skillLevelsOf(ch.id);
      validateConfig(input.config, skillLevels);

      if (input.isDefaultPvp) await clearDefaultPvp(ch.id, id);
      const updated = await db.query<TemplateRow>(
        "UPDATE tactic_templates SET name = $1, config = $2, is_default_pvp = $3, updated_at = now() WHERE id = $4 AND character_id = $5 RETURNING id, name, config, is_default_pvp, updated_at",
        [name, JSON.stringify(input.config), Boolean(input.isDefaultPvp), id, ch.id],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new TemplatesError("not_found", "这份战术不在你的剑谱里");
      return view(updatedRow);
    },

    async remove(accountId, id) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new TemplatesError("no_character", "尚未立名闯江湖");
      const deleted = await db.query<{ id: string }>(
        "DELETE FROM tactic_templates WHERE id = $1 AND character_id = $2 RETURNING id",
        [id, ch.id],
      );
      if (!deleted.rows[0]) throw new TemplatesError("not_found", "这份战术不在你的剑谱里");
    },
  };
}
