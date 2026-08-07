/**
 * M2.5-skills/quests：任务进度表 + 武功练习点持久化。
 * character_quests：角色任务状态（accepted → completed → reported；可重复任务 reported 后可重接）。
 * character_skills.practice_points：practice/study 的进度点（此前仅 level，无练习点列）。
 */
exports.up = async (pgm) => {
  pgm.addColumn("character_skills", {
    practice_points: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createTable("character_quests", {
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters(id)",
      onDelete: "CASCADE",
    },
    quest_id: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "accepted",
      check: "status IN ('accepted','completed','reported')",
    },
    progress: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    accepted_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    completed_at: { type: "timestamptz" },
    reported_at: { type: "timestamptz" },
  });
  pgm.addConstraint("character_quests", "character_quests_pk", {
    primaryKey: ["character_id", "quest_id"],
  });
  pgm.createIndex("character_quests", ["character_id"]);
};

exports.down = async (pgm) => {
  pgm.dropTable("character_quests");
  pgm.dropColumn("character_skills", "practice_points");
};
