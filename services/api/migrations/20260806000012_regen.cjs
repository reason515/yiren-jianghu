/** V2.12 自然恢复：characters 加 last_heal_at（场景交互时按时间差结算恢复，参照 pkuxkx heart_beat）。 */
exports.up = (pgm) => {
  pgm.addColumn("characters", {
    last_heal_at: { type: "timestamptz", notNull: false },
  });
  // 存量角色回填为当前时间（下次交互即从当前起算恢复）
  pgm.sql("UPDATE characters SET last_heal_at = now() WHERE last_heal_at IS NULL");
};

exports.down = (pgm) => {
  pgm.dropColumn("characters", "last_heal_at");
};
