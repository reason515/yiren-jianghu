/**
 * B1-02：账号 / 角色 / 角色技能 / 角色物品 / 战术模板。
 * 设计说明见 docs/database-schema.md。
 * 约定：id 用 uuid（gen_random_uuid）；枚举用 text+CHECK；内容定义不入库（内容包驱动）。
 */
exports.up = async (pgm) => {
  pgm.createTable("accounts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    status: { type: "text", notNull: true, default: "active" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("accounts", "ck_accounts_status", { check: "status IN ('active','frozen')" });

  pgm.createTable("characters", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    account_id: { type: "uuid", notNull: true, references: "accounts(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    gender: { type: "text", notNull: true, default: "male" },
    status: { type: "text", notNull: true, default: "active" },
    attrs: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    exp: { type: "bigint", notNull: true, default: 0 },
    potential: { type: "bigint", notNull: true, default: 0 },
    learned_points: { type: "bigint", notNull: true, default: 0 },
    silver: { type: "bigint", notNull: true, default: 0 },
    qi: { type: "integer", notNull: true, default: 100 },
    jing: { type: "integer", notNull: true, default: 100 },
    jingli: { type: "integer", notNull: true, default: 100 },
    neili: { type: "integer", notNull: true, default: 0 },
    food: { type: "integer", notNull: true, default: 300 },
    water: { type: "integer", notNull: true, default: 300 },
    eff_qi: { type: "integer", notNull: true, default: 100 },
    eff_jing: { type: "integer", notNull: true, default: 100 },
    room_path: { type: "text", notNull: true, default: "" },
    safe_room_id: { type: "text", notNull: true, default: "" },
    current_content_version: { type: "text", notNull: true, default: "0.0.0" },
    discarded_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("characters", "ck_characters_status", {
    check: "status IN ('active','discarded','frozen')",
  });
  pgm.addConstraint("characters", "ck_characters_gender", { check: "gender IN ('male','female')" });
  pgm.createIndex("characters", ["name"], { unique: true });
  // 单角色约束：每个账号仅允许一个 active 角色（放弃后可立即新建）
  pgm.createIndex("characters", ["account_id"], {
    unique: true,
    name: "uq_characters_account_active",
    where: "status = 'active'",
  });
  pgm.createIndex("characters", ["account_id"]);

  pgm.createTable("character_skills", {
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters(id)",
      onDelete: "CASCADE",
    },
    skill_id: { type: "text", notNull: true },
    level: { type: "integer", notNull: true, default: 0 },
  });
  pgm.addConstraint("character_skills", "character_skills_pk", {
    primaryKey: ["character_id", "skill_id"],
  });
  pgm.addConstraint("character_skills", "ck_character_skills_level", { check: "level >= 0" });

  pgm.createTable("character_items", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters(id)",
      onDelete: "CASCADE",
    },
    item_def_id: { type: "text", notNull: true },
    quantity: { type: "integer", notNull: true, default: 1 },
    slot: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("character_items", "ck_character_items_qty", { check: "quantity > 0" });
  pgm.createIndex("character_items", ["character_id"]);

  pgm.createTable("tactic_templates", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters(id)",
      onDelete: "CASCADE",
    },
    name: { type: "text", notNull: true },
    config: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    is_default_pvp: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("tactic_templates", ["character_id"]);
};

exports.down = async (pgm) => {
  pgm.dropTable("tactic_templates");
  pgm.dropTable("character_items");
  pgm.dropTable("character_skills");
  pgm.dropTable("characters");
  pgm.dropTable("accounts");
};
