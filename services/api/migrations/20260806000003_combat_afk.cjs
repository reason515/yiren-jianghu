/**
 * B1-03：战斗会话 / 战斗事件 / 挂机作业（AFK Job）。
 * combat_events 为战报事件流（PVE 与 PVP 通用）；afk_jobs 为服务端持久化作业。
 */
exports.up = async (pgm) => {
  pgm.createTable("combat_sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    character_id: { type: "uuid", notNull: true, references: "characters(id)", onDelete: "CASCADE" },
    kind: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ongoing" },
    target_def_id: { type: "text" },
    seed: { type: "bigint", notNull: true, default: 0 },
    result: { type: "text" },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    finished_at: { type: "timestamptz" },
  });
  pgm.addConstraint("combat_sessions", "ck_combat_kind", { check: "kind IN ('pve','pvp')" });
  pgm.addConstraint("combat_sessions", "ck_combat_status", {
    check: "status IN ('ongoing','finished','abandoned')",
  });
  pgm.addConstraint("combat_sessions", "ck_combat_result", {
    check: "result IS NULL OR result IN ('win','lose','escape')",
  });
  pgm.createIndex("combat_sessions", ["character_id", "status"]);

  pgm.createTable("combat_events", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    session_id: { type: "uuid", notNull: true, references: "combat_sessions(id)", onDelete: "CASCADE" },
    seq: { type: "integer", notNull: true },
    type: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("combat_events", ["session_id", "seq"]);

  pgm.createTable("afk_jobs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    character_id: { type: "uuid", notNull: true, references: "characters(id)", onDelete: "CASCADE" },
    kind: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "running" },
    phase: { type: "text", notNull: true, default: "init" },
    template_id: { type: "uuid" },
    template_snapshot: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    config: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    day: { type: "text", notNull: true, default: "" },
    hours_today: { type: "numeric", notNull: true, default: 0 },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    scheduled_end_at: { type: "timestamptz" },
    last_tick_at: { type: "timestamptz" },
    report: { type: "jsonb" },
    stop_reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("afk_jobs", "ck_afk_kind", {
    check: "kind IN ('quest','study','grind','fishing','peiyao')",
  });
  pgm.addConstraint("afk_jobs", "ck_afk_status", {
    check: "status IN ('running','paused','completed','failed','cancelled')",
  });
  pgm.addConstraint("afk_jobs", "fk_afk_template", {
    foreignKeys: { columns: "template_id", references: "tactic_templates(id)" },
  });
  // Worker 崩溃恢复扫描：运行中且到期的作业
  pgm.createIndex("afk_jobs", ["status", "scheduled_end_at"]);
  pgm.createIndex("afk_jobs", ["character_id"]);
};

exports.down = async (pgm) => {
  pgm.dropTable("afk_jobs");
  pgm.dropTable("combat_events");
  pgm.dropTable("combat_sessions");
};
