/**
 * DC-054：挂机 kind 扩展练功/打坐/吐纳。
 * 既有库 0003 约束仅 quest/study/grind（及预留 fishing/peiyao），INSERT practice 会 23514 → API 500。
 * 本迁移扩约束；study 保留兼容旧作业。新库 0003 源码已同步，此处 drop+add 仍安全。
 */
exports.up = (pgm) => {
  pgm.dropConstraint("afk_jobs", "ck_afk_kind");
  pgm.addConstraint("afk_jobs", "ck_afk_kind", {
    check: "kind IN ('quest','study','grind','practice','dazuo','tuna','fishing','peiyao')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("afk_jobs", "ck_afk_kind");
  pgm.addConstraint("afk_jobs", "ck_afk_kind", {
    check: "kind IN ('quest','study','grind','fishing','peiyao')",
  });
};
