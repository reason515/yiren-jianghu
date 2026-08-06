/**
 * B1-04：PVP 赛季 / PVP 对战 / PVP 积分 / 排行榜快照。
 * 对战双方为角色快照（jsonb）+ 固定种子，可复盘可重演；排行榜按快照落库。
 */
exports.up = async (pgm) => {
  pgm.createTable("pvp_seasons", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    starts_at: { type: "timestamptz", notNull: true },
    ends_at: { type: "timestamptz", notNull: true },
    status: { type: "text", notNull: true, default: "upcoming" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("pvp_seasons", "ck_season_status", {
    check: "status IN ('upcoming','active','ended')",
  });

  pgm.createTable("pvp_matches", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    season_id: { type: "uuid", references: "pvp_seasons(id)" },
    challenger_id: { type: "uuid", notNull: true, references: "characters(id)" },
    defender_id: { type: "uuid", notNull: true, references: "characters(id)" },
    challenger_snapshot: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    defender_snapshot: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    seed: { type: "bigint", notNull: true, default: 0 },
    result: { type: "text" },
    score_delta: { type: "integer", notNull: true, default: 0 },
    report: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("pvp_matches", "ck_match_result", {
    check: "result IS NULL OR result IN ('challenger_win','defender_win','draw','invalid')",
  });
  pgm.createIndex("pvp_matches", ["season_id"]);
  pgm.createIndex("pvp_matches", ["challenger_id", "created_at"]);

  pgm.createTable(
    "pvp_scores",
    {
      character_id: {
        type: "uuid",
        notNull: true,
        references: "characters(id)",
        onDelete: "CASCADE",
      },
      season_id: {
        type: "uuid",
        notNull: true,
        references: "pvp_seasons(id)",
        onDelete: "CASCADE",
      },
      score: { type: "integer", notNull: true, default: 0 },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { primaryKey: ["character_id", "season_id"] },
  );

  pgm.createTable("leaderboard_snapshots", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    kind: { type: "text", notNull: true },
    season_id: { type: "uuid", references: "pvp_seasons(id)" },
    generated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    entries: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.addConstraint("leaderboard_snapshots", "ck_lb_kind", {
    check: "kind IN ('growth','season_pvp')",
  });
  pgm.createIndex("leaderboard_snapshots", ["kind", "season_id", "generated_at"]);
};

exports.down = async (pgm) => {
  pgm.dropTable("leaderboard_snapshots");
  pgm.dropTable("pvp_scores");
  pgm.dropTable("pvp_matches");
  pgm.dropTable("pvp_seasons");
};
