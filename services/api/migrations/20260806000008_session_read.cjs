/**
 * M2.5-session：重连恢复点的"未读"标记。
 * afk_jobs.read_at / pvp_matches.read_at：断线期间完成的终态战报/对战，resume 时返回并置已读。
 */
exports.up = async (pgm) => {
  pgm.addColumn("afk_jobs", {
    read_at: { type: "timestamptz" },
  });
  pgm.addColumn("pvp_matches", {
    read_at: { type: "timestamptz" },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumn("pvp_matches", "read_at");
  pgm.dropColumn("afk_jobs", "read_at");
};
